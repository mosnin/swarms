import { describe, expect, it } from "vitest";

import { splitRevenue } from "@/modules/marketplace/revenue";

describe("splitRevenue", () => {
  it("splits gross into platform fee + creator earning (20%)", () => {
    const s = splitRevenue(1000, 2000);
    expect(s.platformFeeMinor).toBe(200);
    expect(s.creatorEarningMinor).toBe(800);
    expect(s.platformFeeMinor + s.creatorEarningMinor).toBe(s.grossMinor);
  });

  it("is deterministic and integer-exact (no float drift)", () => {
    const s = splitRevenue(999, 2000); // 19.98% of 999 = 199.8 -> 200 (half-up)
    expect(s.platformFeeMinor).toBe(200);
    expect(s.creatorEarningMinor).toBe(799);
    expect(s.platformFeeMinor + s.creatorEarningMinor).toBe(999);
  });

  it("handles a zero fee", () => {
    expect(splitRevenue(500, 0)).toEqual({
      grossMinor: 500,
      platformFeeMinor: 0,
      creatorEarningMinor: 500,
    });
  });

  it("handles a 100% fee", () => {
    const s = splitRevenue(500, 10_000);
    expect(s.platformFeeMinor).toBe(500);
    expect(s.creatorEarningMinor).toBe(0);
  });

  it("never loses or creates minor units across the split", () => {
    for (const gross of [1, 7, 33, 101, 12345]) {
      for (const bps of [0, 250, 1000, 3333, 10000]) {
        const s = splitRevenue(gross, bps);
        expect(s.platformFeeMinor + s.creatorEarningMinor).toBe(gross);
        expect(Number.isInteger(s.platformFeeMinor)).toBe(true);
        expect(Number.isInteger(s.creatorEarningMinor)).toBe(true);
      }
    }
  });
});
