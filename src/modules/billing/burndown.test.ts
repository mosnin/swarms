/**
 * Unit: the burn-down series builder. History is dense and ends today;
 * the projection depletes the balance at the burn rate down to exactly zero.
 */

import { describe, expect, it } from "vitest";

import { buildBurndown } from "@/modules/billing/burndown";

describe("buildBurndown", () => {
  it("produces a dense history of the requested length ending today", () => {
    const s = buildBurndown({
      byDay: [{ date: "2026-07-22", spentMinor: 300 }],
      balanceMinor: 10_000,
      dailyBurnMinor: 0,
      windowDays: 7,
      todayIso: "2026-07-24",
    });
    expect(s.history).toHaveLength(7);
    expect(s.history[s.history.length - 1]!.date).toBe("2026-07-24");
    expect(s.history[0]!.date).toBe("2026-07-18");
    // Known day carries its spend; gaps are zero.
    expect(s.history.find((h) => h.date === "2026-07-22")!.spentMinor).toBe(300);
    expect(s.history.find((h) => h.date === "2026-07-23")!.spentMinor).toBe(0);
    expect(s.maxSpendMinor).toBe(300);
  });

  it("projects the balance to zero at the runway horizon", () => {
    const s = buildBurndown({
      byDay: [],
      balanceMinor: 1_000,
      dailyBurnMinor: 100,
      windowDays: 14,
      todayIso: "2026-07-24",
    });
    expect(s.runwayDays).toBe(10);
    // First point is today's balance; last point is zero at day 10.
    expect(s.projection[0]).toEqual({ date: "2026-07-24", balanceMinor: 1_000 });
    const last = s.projection[s.projection.length - 1]!;
    expect(last.balanceMinor).toBe(0);
    expect(last.date).toBe("2026-08-03"); // +10 days
    expect(s.projection).toHaveLength(11); // today + 10
  });

  it("has no runway and a flat single-point projection when burn is zero", () => {
    const s = buildBurndown({
      byDay: [],
      balanceMinor: 5_000,
      dailyBurnMinor: 0,
      windowDays: 30,
      todayIso: "2026-07-24",
    });
    expect(s.runwayDays).toBeNull();
    expect(s.projection).toEqual([{ date: "2026-07-24", balanceMinor: 5_000 }]);
  });

  it("caps the projection at 90 days for a very long runway", () => {
    const s = buildBurndown({
      byDay: [],
      balanceMinor: 1_000_000,
      dailyBurnMinor: 1,
      windowDays: 30,
      todayIso: "2026-07-24",
    });
    expect(s.runwayDays).toBe(1_000_000);
    expect(s.projection.length).toBe(91); // today + 90 capped
  });
});
