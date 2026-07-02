import { describe, expect, it } from "vitest";

import { fixedClock } from "@/lib/time";
import { InMemoryRateLimiter } from "@/server/ratelimit/tokenBucket";

describe("InMemoryRateLimiter", () => {
  it("allows up to the burst/limit then blocks", () => {
    const clock = fixedClock(0);
    const rl = new InMemoryRateLimiter(clock);
    const rule = { limit: 3, windowMs: 1000 };

    expect(rl.check("k", rule).allowed).toBe(true);
    expect(rl.check("k", rule).allowed).toBe(true);
    expect(rl.check("k", rule).allowed).toBe(true);
    const blocked = rl.check("k", rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAtMs).toBeGreaterThan(clock.epochMs());
  });

  it("refills over time", () => {
    const clock = fixedClock(0);
    const rl = new InMemoryRateLimiter(clock);
    const rule = { limit: 2, windowMs: 1000 };

    rl.check("k", rule);
    rl.check("k", rule);
    expect(rl.check("k", rule).allowed).toBe(false);

    // After 600ms, ~1.2 tokens refill (limit/window = 2/1000 per ms).
    clock.advance(600);
    expect(rl.check("k", rule).allowed).toBe(true);
  });

  it("isolates buckets by key", () => {
    const clock = fixedClock(0);
    const rl = new InMemoryRateLimiter(clock);
    const rule = { limit: 1, windowMs: 1000 };

    expect(rl.check("a", rule).allowed).toBe(true);
    expect(rl.check("a", rule).allowed).toBe(false);
    // Different key has its own budget.
    expect(rl.check("b", rule).allowed).toBe(true);
  });

  it("never exceeds capacity on long idle", () => {
    const clock = fixedClock(0);
    const rl = new InMemoryRateLimiter(clock);
    const rule = { limit: 2, windowMs: 1000 };
    rl.check("k", rule);
    clock.advance(1_000_000); // long idle
    // Capacity is 2; should allow exactly 2 in a row, then block.
    expect(rl.check("k", rule).allowed).toBe(true);
    expect(rl.check("k", rule).allowed).toBe(true);
    expect(rl.check("k", rule).allowed).toBe(false);
  });
});
