/**
 * Money is represented strictly as an **integer count of minor units** (e.g.
 * cents) plus an ISO-4217 currency code. Floating-point numbers are never used
 * for monetary arithmetic — all operations are integer operations and any
 * division is performed with an explicit, total rounding rule.
 */

import { z } from "zod";

export interface Money {
  /** Integer amount in the currency's minor unit (e.g. cents). */
  readonly amountMinor: number;
  /** Upper-case ISO-4217 currency code, e.g. "USD". */
  readonly currency: string;
}

export type RoundingMode = "half_up" | "floor" | "ceil";

const CURRENCY_RE = /^[A-Z]{3}$/;

export const moneySchema = z.object({
  amountMinor: z
    .number()
    .int("amountMinor must be an integer number of minor units")
    .refine(Number.isSafeInteger, "amountMinor exceeds safe integer range"),
  currency: z.string().regex(CURRENCY_RE, "currency must be a 3-letter ISO-4217 code"),
});

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, received ${value}`);
  }
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

/** Construct money from an integer minor-unit amount. */
export function money(amountMinor: number, currency: string): Money {
  assertInteger(amountMinor, "amountMinor");
  const code = currency.toUpperCase();
  if (!CURRENCY_RE.test(code)) {
    throw new TypeError(`Invalid currency code: ${currency}`);
  }
  return Object.freeze({ amountMinor, currency: code });
}

/** Zero amount in the given currency. */
export function zero(currency: string): Money {
  return money(0, currency);
}

export function isZero(m: Money): boolean {
  return m.amountMinor === 0;
}

export function isNegative(m: Money): boolean {
  return m.amountMinor < 0;
}

export function isPositive(m: Money): boolean {
  return m.amountMinor > 0;
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negate(m: Money): Money {
  return money(-m.amountMinor, m.currency);
}

/** Multiply by an integer factor (e.g. unit quantity). Stays integer-exact. */
export function multiplyByInt(m: Money, factor: number): Money {
  assertInteger(factor, "factor");
  return money(m.amountMinor * factor, m.currency);
}

/** Sum a list; the currency is taken from the list or `currency` when empty. */
export function sum(items: readonly Money[], currency?: string): Money {
  if (items.length === 0) {
    if (!currency) throw new TypeError("Cannot sum an empty list without a currency");
    return zero(currency);
  }
  return items.reduce((acc, item) => add(acc, item));
}

/**
 * Apply integer basis-points (1/10000) of an amount, e.g. a fee or percentage,
 * with an explicit rounding rule. Computed in integer space — no floats.
 */
export function applyBasisPoints(
  m: Money,
  basisPoints: number,
  rounding: RoundingMode = "half_up",
): Money {
  assertInteger(basisPoints, "basisPoints");
  const numerator = m.amountMinor * basisPoints;
  return money(divideRounded(numerator, 10_000, rounding), m.currency);
}

function divideRounded(numerator: number, denominator: number, rounding: RoundingMode): number {
  const quotient = Math.trunc(numerator / denominator);
  const remainder = numerator % denominator;
  if (remainder === 0) return quotient;
  switch (rounding) {
    case "floor":
      return numerator < 0 ? quotient - 1 : quotient;
    case "ceil":
      return numerator > 0 ? quotient + 1 : quotient;
    case "half_up": {
      // Round half away from zero based on twice the absolute remainder.
      const twiceRemainder = Math.abs(remainder) * 2;
      const roundsUp = twiceRemainder >= Math.abs(denominator);
      if (!roundsUp) return quotient;
      return numerator < 0 ? quotient - 1 : quotient + 1;
    }
  }
}

/**
 * Split an amount into `parts` shares as evenly as possible with no minor units
 * lost. The first `remainder` shares receive one extra minor unit so the parts
 * always sum exactly back to the original amount.
 */
export function allocate(m: Money, parts: number): Money[] {
  assertInteger(parts, "parts");
  if (parts <= 0) throw new RangeError("parts must be a positive integer");
  const base = Math.trunc(m.amountMinor / parts);
  const remainder = m.amountMinor - base * parts;
  const extra = remainder >= 0 ? 1 : -1;
  const remaining = Math.abs(remainder);
  return Array.from({ length: parts }, (_unused, index) =>
    money(base + (index < remaining ? extra : 0), m.currency),
  );
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

/**
 * Convert a human-readable major-unit amount (e.g. dollars) to integer minor
 * units (e.g. cents).  Uses `Intl` to determine the correct exponent for the
 * currency so JPY (0 decimals) and KWD (3 decimals) are handled automatically.
 *
 * Only use this at API boundaries — all internal math operates on minor units.
 */
export function majorToMinor(majorAmount: number, currency: string): number {
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const exponent = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round(majorAmount * 10 ** exponent);
}

/** Convenience wrapper for the common USD case. */
export function usdToMinor(dollars: number): number {
  return majorToMinor(dollars, "USD");
}

/**
 * Format for display using the platform `Intl` data. The minor-unit integer is
 * converted to a string for display only — never used for further math.
 */
export function format(m: Money, locale = "en-US"): string {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: m.currency });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = 10 ** fractionDigits;
  // Build the major.minor string from integer parts to avoid float drift.
  const negative = m.amountMinor < 0;
  const absMinor = Math.abs(m.amountMinor);
  const majorUnits = Math.trunc(absMinor / divisor);
  const minorUnits = absMinor % divisor;
  const value = Number(`${majorUnits}.${String(minorUnits).padStart(fractionDigits, "0")}`);
  return formatter.format(negative ? -value : value);
}
