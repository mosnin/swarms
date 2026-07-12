import { describe, expect, it } from "vitest";

import { isValidCron, nextRun, parseCron } from "@/server/schedules/cron";

describe("parseCron", () => {
  it("accepts standard expressions", () => {
    expect(isValidCron("* * * * *")).toBe(true);
    expect(isValidCron("0 9 * * 1")).toBe(true);
    expect(isValidCron("*/15 * * * *")).toBe(true);
    expect(isValidCron("0 0 1,15 * *")).toBe(true);
    expect(isValidCron("30 8-17/2 * * 1-5")).toBe(true);
    expect(isValidCron("0 0 * * 7")).toBe(true); // 7 = Sunday
  });

  it("rejects malformed expressions", () => {
    expect(isValidCron("* * * *")).toBe(false); // 4 fields
    expect(isValidCron("60 * * * *")).toBe(false); // minute out of range
    expect(isValidCron("* 24 * * *")).toBe(false); // hour out of range
    expect(isValidCron("* * 0 * *")).toBe(false); // dom min is 1
    expect(isValidCron("*/0 * * * *")).toBe(false); // zero step
    expect(isValidCron("abc")).toBe(false);
  });

  it("expands ranges and steps", () => {
    const f = parseCron("*/15 * * * *");
    expect([...f.minutes].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });
});

describe("nextRun", () => {
  it("finds the next matching minute", () => {
    // 2026-01-01T00:00:00Z is a Thursday.
    const after = new Date("2026-01-01T00:00:00Z");
    const next = nextRun("*/15 * * * *", after);
    expect(next?.toISOString()).toBe("2026-01-01T00:15:00.000Z");
  });

  it("advances to the next day for a daily schedule", () => {
    const after = new Date("2026-01-01T09:30:00Z");
    const next = nextRun("0 9 * * *", after);
    expect(next?.toISOString()).toBe("2026-01-02T09:00:00.000Z");
  });

  it("honours day-of-week (next Monday 09:00)", () => {
    // 2026-01-01 is Thursday; next Monday is 2026-01-05.
    const after = new Date("2026-01-01T00:00:00Z");
    const next = nextRun("0 9 * * 1", after);
    expect(next?.toISOString()).toBe("2026-01-05T09:00:00.000Z");
  });

  it("uses OR semantics when both dom and dow are restricted", () => {
    // Fire on the 1st OR any Monday. From Fri 2026-05-01 00:00, the very next
    // match is the same day (the 1st) at 00:00 is not > after, so 2026-05-04 Mon
    // vs 2026-06-01 — Monday comes first.
    const after = new Date("2026-05-01T12:00:00Z");
    const next = nextRun("0 0 1 * 1", after);
    expect(next?.toISOString()).toBe("2026-05-04T00:00:00.000Z"); // Monday
  });

  it("returns null for an unsatisfiable expression", () => {
    expect(nextRun("0 0 30 2 *", new Date("2026-01-01T00:00:00Z"))).toBeNull(); // Feb 30
  });
});
