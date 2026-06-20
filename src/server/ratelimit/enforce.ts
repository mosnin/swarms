/**
 * Route-facing rate-limit helpers: standard rules per surface + a key derived
 * from the principal (API key for agents, organization for human sessions).
 */

import type { AuthContext } from "@/modules/identity/access-control";
import { enforceRateLimit as enforce, type RateLimitRule } from "@/server/ratelimit/tokenBucket";

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

export function enforceRateLimit(ctx: AuthContext, surface: keyof typeof RATE_RULES): void {
  enforce(rateKeyFor(ctx, surface), RATE_RULES[surface]);
}
