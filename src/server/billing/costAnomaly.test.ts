import { describe, expect, it } from "vitest";

import { detectCostAnomaly } from "@/server/billing/costAnomaly";

describe("detectCostAnomaly", () => {
  const recent = [100, 110, 90, 105]; // avg ~101

  it("flags a charge far above the trailing average", () => {
    const v = detectCostAnomaly(1_000, recent, 4, 100);
    expect(v.isAnomaly).toBe(true);
    expect(v.averageMinor).toBe(101);
    expect(v.ratio).toBeGreaterThan(4);
  });

  it("does not flag a charge near the average", () => {
    expect(detectCostAnomaly(150, recent, 4, 100).isAnomaly).toBe(false);
  });

  it("ignores charges below the floor even if ratio is high", () => {
    expect(detectCostAnomaly(80, [1, 2, 3], 4, 100).isAnomaly).toBe(false);
  });

  it("needs a minimum number of samples", () => {
    expect(detectCostAnomaly(1_000, [10, 10], 4, 100).isAnomaly).toBe(false);
  });

  it("is disabled when factor is 0", () => {
    expect(detectCostAnomaly(1_000_000, recent, 0, 100).isAnomaly).toBe(false);
  });
});
