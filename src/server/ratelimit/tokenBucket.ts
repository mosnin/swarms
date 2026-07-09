/**
 * Token-bucket rate limiter. Pure, clock-injectable bucket logic + an in-memory
 * adapter for single-instance enforcement. The `RateLimiter` port allows a
 * distributed (Redis) adapter later; the in-memory adapter is documented as
 * single-instance only (see KNOWN_RISKS).
 */

import { Errors } from "@/lib/errors";
import { systemClock, type Clock } from "@/lib/time";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Epoch ms when at least one more token is available. */
  retryAtMs: number;
}

export interface RateLimitRule {
  /** Sustained requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Optional burst capacity (defaults to `limit`). */
  burst?: number;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimiter {
  check(key: string, rule: RateLimitRule): RateLimitDecision;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private lastPruneMs = 0;
  // A bucket untouched for longer than this has fully refilled for any sane rule,
  // so it's indistinguishable from a fresh one — drop it to bound memory growth
  // across many distinct principals.
  private static readonly IDLE_TTL_MS = 10 * 60_000;
  private static readonly PRUNE_INTERVAL_MS = 60_000;

  constructor(private readonly clock: Clock = systemClock) {}

  private prune(now: number): void {
    if (now - this.lastPruneMs < InMemoryRateLimiter.PRUNE_INTERVAL_MS) return;
    this.lastPruneMs = now;
    for (const [key, state] of this.buckets) {
      if (now - state.lastRefillMs > InMemoryRateLimiter.IDLE_TTL_MS) this.buckets.delete(key);
    }
  }

  check(key: string, rule: RateLimitRule): RateLimitDecision {
    const capacity = rule.burst ?? rule.limit;
    const refillPerMs = rule.limit / rule.windowMs;
    const now = this.clock.epochMs();
    this.prune(now);

    const state = this.buckets.get(key) ?? { tokens: capacity, lastRefillMs: now };
    // Refill based on elapsed time.
    const elapsed = Math.max(0, now - state.lastRefillMs);
    state.tokens = Math.min(capacity, state.tokens + elapsed * refillPerMs);
    state.lastRefillMs = now;

    if (state.tokens >= 1) {
      state.tokens -= 1;
      this.buckets.set(key, state);
      return { allowed: true, remaining: Math.floor(state.tokens), retryAtMs: now };
    }

    const deficit = 1 - state.tokens;
    const waitMs = Math.ceil(deficit / refillPerMs);
    this.buckets.set(key, state);
    return { allowed: false, remaining: 0, retryAtMs: now + waitMs };
  }
}

let shared: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  if (!shared) shared = new InMemoryRateLimiter();
  return shared;
}

/** Test seam. */
export function setRateLimiter(limiter: RateLimiter | undefined): void {
  shared = limiter;
}

/** Enforce a rule for `key`; throws `RATE_LIMITED` when exceeded. */
export function enforceRateLimit(key: string, rule: RateLimitRule): void {
  const decision = getRateLimiter().check(key, rule);
  if (!decision.allowed) {
    throw Errors.rateLimited(
      `Rate limit exceeded; retry in ${Math.max(0, decision.retryAtMs - Date.now())}ms`,
    );
  }
}
