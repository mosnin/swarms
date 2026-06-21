/**
 * Route-facing rate-limit helpers: standard rules per surface + a key derived
 * from the principal (API key for agents, organization for human sessions).
 *
 * Backend is selected by `RATE_LIMIT_BACKEND`: `memory` (in-process token
 * bucket; single-instance) or `postgres` (shared fixed-window; multi-instance).
 */

import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import type { AuthContext } from "@/modules/identity/access-control";
import { pgRateLimitCheck } from "@/server/ratelimit/pgRateLimiter";
import { getRateLimiter, type RateLimitRule } from "@/server/ratelimit/tokenBucket";

export const RATE_RULES = {
  execute: { limit: 60, windowMs: 60_000 },
  executePaid: { limit: 30, windowMs: 60_000 },
  swarmRun: { limit: 10, windowMs: 60_000 },
  connectorCall: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/** Stable rate-limit key for the principal in a given surface. */
export function rateKeyFor(ctx: AuthContext, surface: string): string {
  const principal =
    ctx.actor.kind === "agent" ? `key:${ctx.actor.apiKeyId}` : `org:${ctx.organizationId}`;
  return `${surface}:${principal}`;
}

export async function enforceRateLimit(
  ctx: AuthContext,
  surface: keyof typeof RATE_RULES,
): Promise<void> {
  const key = rateKeyFor(ctx, surface);
  const rule = RATE_RULES[surface];

  const decision =
    env.RATE_LIMIT_BACKEND === "postgres"
      ? await pgRateLimitCheck(key, rule)
      : getRateLimiter().check(key, rule);

  if (!decision.allowed) {
    throw Errors.rateLimited(
      `Rate limit exceeded; retry in ${Math.max(0, decision.retryAtMs - Date.now())}ms`,
    );
  }
}
