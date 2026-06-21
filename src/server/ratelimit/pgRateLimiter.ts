/**
 * Postgres-backed fixed-window rate limiter. Shared across web instances (unlike
 * the in-memory token bucket), so per-principal limits hold under horizontal
 * scale. Each (key, window) is an atomic upsert-increment; the window resets
 * when wall-clock crosses the next boundary.
 */

import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import type { RateLimitDecision, RateLimitRule } from "@/server/ratelimit/tokenBucket";

type Db = ReturnType<typeof getDb>;

export async function pgRateLimitCheck(
  key: string,
  rule: RateLimitRule,
  db: Db = getDb(),
): Promise<RateLimitDecision> {
  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
  const windowStart = new Date(windowStartMs);
  const limit = rule.burst ?? rule.limit;

  // Atomic increment for this (key, window). Returns the new count.
  const result = await db.execute(sql`
    INSERT INTO rate_limit_counters (key, window_start, count)
    VALUES (${key}, ${windowStart.toISOString()}, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count
  `);

  // Normalize across drivers: postgres-js returns an array; pglite returns { rows }.
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as Array<{
    count: number;
  }>;
  const count = Number(rows[0]?.count ?? 1);
  const remaining = Math.max(0, limit - count);
  const retryAtMs = windowStartMs + rule.windowMs;
  return { allowed: count <= limit, remaining, retryAtMs };
}
