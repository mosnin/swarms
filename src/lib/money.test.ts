import { describe, expect, it } from "vitest";

import {
  add,
  allocate,
  applyBasisPoints,
  compare,
  equals,
  format,
  majorToMinor,
  money,
  multiplyByInt,
  subtract,
  sum,
  usdToMinor,
  zero,
} from "@/lib/money";

describe("money construction", () => {
  it("requires integer minor units", () => {
    expect(() => money(10.5, "USD")).toThrowError(/safe integer/);
  });

  it("normalizes and validates the currency code", () => {
    expect(money(100, "usd").currency).toBe("USD");
    expect(() => money(100, "US")).toThrowError(/currency/i);
  });

  it("produces an immutable value", () => {
    const m = money(100, "USD");
    expect(Object.isFrozen(m)).toBe(true);
  });
});

describe("integer arithmetic (no floating point)", () => {
  it("adds ten dimes to exactly one dollar", () => {
    // The classic 0.1 + 0.2 float bug does not occur with integer minor units.
    const dimes = Array.from({ length: 10 }, () => money(10, "USD"));
    expect(sum(dimes).amountMinor).toBe(100);
    expect(equals(sum(dimes), money(100, "USD"))).toBe(true);
  });

  it("adds and subtracts within a currency", () => {
    expect(add(money(150, "USD"), money(50, "USD")).amountMinor).toBe(200);
    expect(subtract(money(150, "USD"), money(50, "USD")).amountMinor).toBe(100);
  });

  it("rejects mismatched currencies", () => {
    expect(() => add(money(100, "USD"), money(100, "EUR"))).toThrowError(/mismatch/i);
  });

  it("multiplies by an integer factor only", () => {
    expect(multiplyByInt(money(99, "USD"), 3).amountMinor).toBe(297);
    expect(() => multiplyByInt(money(99, "USD"), 1.5)).toThrowError(/safe integer/);
  });
});

describe("applyBasisPoints", () => {
  it("computes a percentage with half-up rounding in integer space", () => {
    // 2.5% of 1000 = 25
    expect(applyBasisPoints(money(1000, "USD"), 250).amountMinor).toBe(25);
    // 2.5% of 1001 = 25.025 -> 25
    expect(applyBasisPoints(money(1001, "USD"), 250).amountMinor).toBe(25);
    // 1% of 1050 = 10.5 -> 11 (half-up)
    expect(applyBasisPoints(money(1050, "USD"), 100).amountMinor).toBe(11);
  });

  it("rounds half away from zero for negatives", () => {
    expect(applyBasisPoints(money(-1050, "USD"), 100).amountMinor).toBe(-11);
  });
});

describe("allocate", () => {
  it("splits with no minor units lost", () => {
    const parts = allocate(money(100, "USD"), 3);
    expect(parts.map((p) => p.amountMinor)).toEqual([34, 33, 33]);
    expect(sum(parts).amountMinor).toBe(100);
  });

  it("handles exact divisions", () => {
    const parts = allocate(money(100, "USD"), 4);
    expect(parts.map((p) => p.amountMinor)).toEqual([25, 25, 25, 25]);
  });

  it("rejects non-positive part counts", () => {
    expect(() => allocate(money(100, "USD"), 0)).toThrowError();
  });
});

describe("majorToMinor / usdToMinor", () => {
  it("converts whole dollars to cents", () => {
    expect(usdToMinor(1)).toBe(100);
    expect(usdToMinor(3)).toBe(300);
  });

  it("converts fractional dollars, rounding correctly", () => {
    expect(usdToMinor(1.5)).toBe(150);
    expect(usdToMinor(0.01)).toBe(1);
    expect(usdToMinor(1.99)).toBe(199);
    // Classic float trap: 1.005 * 100 = 100.49999… in IEEE-754. The 15-sig-fig
    // normalization collapses the noise so this now rounds half-away-from-zero.
    expect(usdToMinor(1.005)).toBe(101);
    expect(usdToMinor(2.675)).toBe(268);
    expect(usdToMinor(-1.005)).toBe(-101);
  });

  it("handles currencies with no minor unit (JPY)", () => {
    expect(majorToMinor(500, "JPY")).toBe(500);
  });

  it("handles currencies with 3 decimal places (KWD)", () => {
    expect(majorToMinor(1, "KWD")).toBe(1000);
  });
});

describe("comparison and formatting", () => {
  it("compares amounts", () => {
    expect(compare(money(100, "USD"), money(200, "USD"))).toBe(-1);
    expect(compare(money(200, "USD"), money(100, "USD"))).toBe(1);
    expect(compare(money(100, "USD"), money(100, "USD"))).toBe(0);
  });

  it("formats integer minor units for display", () => {
    expect(format(money(123456, "USD"))).toBe("$1,234.56");
    expect(format(zero("USD"))).toBe("$0.00");
    expect(format(money(-500, "USD"))).toBe("-$5.00");
  });
});
