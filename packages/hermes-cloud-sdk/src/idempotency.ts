/**
 * Idempotency + budget helpers. Every paid action requires a stable idempotency
 * key; retrying with the same key never double-charges. Budgets are always
 * expressed in integer minor units (never floats).
 */

import { randomUUID } from "node:crypto";

/** Generate a fresh idempotency key (URL-safe, matches the server key rules). */
export function generateIdempotencyKey(prefix = "hermes"): string {
  return `${prefix}-${randomUUID()}`;
}

/** Convert a major-unit amount (e.g. dollars) to integer minor units (cents). */
export function toMinorUnits(majorAmount: number, fractionDigits = 2): number {
  if (!Number.isFinite(majorAmount)) throw new TypeError("amount must be finite");
  const factor = 10 ** fractionDigits;
  // Round to the nearest minor unit to avoid float drift.
  return Math.round(majorAmount * factor);
}

/** A typed budget cap in minor units. */
export function budget(minorUnits: number, currency = "USD"): { budgetMinor: number; currency: string } {
  if (!Number.isInteger(minorUnits) || minorUnits < 0) {
    throw new TypeError("budget must be a non-negative integer number of minor units");
  }
  return { budgetMinor: minorUnits, currency };
}
