import { beforeEach, describe, expect, it } from "vitest";

import { pgRateLimitCheck } from "@/server/ratelimit/pgRateLimiter";
import { createTestDb, type TestDb } from "./harness";

describe("integration: Postgres-backed rate limiter (shared store)", () => {
  let db: TestDb;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  it("counts across calls and blocks past the limit within a window", async () => {
    const rule = { limit: 3, windowMs: 60_000 };
    expect((await pgRateLimitCheck("k1", rule, db)).allowed).toBe(true);
    expect((await pgRateLimitCheck("k1", rule, db)).allowed).toBe(true);
    const third = await pgRateLimitCheck("k1", rule, db);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect((await pgRateLimitCheck("k1", rule, db)).allowed).toBe(false);
  });

  it("isolates counters by key (the shared-store property)", async () => {
    const rule = { limit: 1, windowMs: 60_000 };
    expect((await pgRateLimitCheck("a", rule, db)).allowed).toBe(true);
    expect((await pgRateLimitCheck("a", rule, db)).allowed).toBe(false);
    // A different key (or, in production, a different web instance) shares the
    // same counter table and gets its own budget.
    expect((await pgRateLimitCheck("b", rule, db)).allowed).toBe(true);
  });
});
