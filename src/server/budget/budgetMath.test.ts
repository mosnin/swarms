import { describe, expect, it } from "vitest";

import {
  availableMinor,
  committedMinor,
  reservedMinor,
  spentMinor,
  wouldExceed,
  type BudgetLedgerEntry,
} from "@/server/budget/budgetMath";

const hold = (n: number): BudgetLedgerEntry => ({ direction: "debit", kind: "hold", amountMinor: n, currency: "USD" });
const release = (n: number): BudgetLedgerEntry => ({
  direction: "credit",
  kind: "release",
  amountMinor: n,
  currency: "USD",
});
const charge = (n: number): BudgetLedgerEntry => ({
  direction: "debit",
  kind: "charge",
  amountMinor: n,
  currency: "USD",
});

describe("budget math", () => {
  it("sums committed charges", () => {
    expect(committedMinor([charge(100), charge(50)])).toBe(150);
  });

  it("nets outstanding reservations (holds minus releases)", () => {
    expect(reservedMinor([hold(200), release(50)])).toBe(150);
  });

  it("never reports negative reservations", () => {
    expect(reservedMinor([hold(100), release(300)])).toBe(0);
  });

  it("spent = committed + outstanding reservations", () => {
    expect(spentMinor([hold(200), charge(100)])).toBe(300);
  });

  it("a committed job (hold released, charge recorded) counts once", () => {
    // reserve 200 -> charge 180 + release 200 => spent should be 180.
    expect(spentMinor([hold(200), charge(180), release(200)])).toBe(180);
  });

  it("computes available headroom", () => {
    expect(availableMinor(1000, [hold(200), charge(100)])).toBe(700);
  });

  it("detects when a new charge would exceed the limit", () => {
    expect(wouldExceed(1000, [charge(900)], 200)).toBe(true);
    expect(wouldExceed(1000, [charge(900)], 100)).toBe(false);
  });
});
