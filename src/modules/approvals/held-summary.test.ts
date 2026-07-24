import { describe, expect, it } from "vitest";

import { summarizeHeld } from "@/modules/approvals/held-summary";

describe("summarizeHeld", () => {
  it("counts items and totals within a single currency", () => {
    expect(
      summarizeHeld([
        { costMinor: 250, costCurrency: "USD" },
        { costMinor: 100, costCurrency: "USD" },
      ]),
    ).toEqual({ count: 2, totalMinor: 350, currency: "USD" });
  });

  it("defaults to USD and zero for an empty inbox", () => {
    expect(summarizeHeld([])).toEqual({ count: 0, totalMinor: 0, currency: "USD" });
  });

  it("counts off-currency items but excludes them from the total", () => {
    const s = summarizeHeld([
      { costMinor: 500, costCurrency: "USD" },
      { costMinor: 900, costCurrency: "EUR" },
    ]);
    expect(s.count).toBe(2);
    expect(s.currency).toBe("USD");
    expect(s.totalMinor).toBe(500); // EUR excluded
  });
});
