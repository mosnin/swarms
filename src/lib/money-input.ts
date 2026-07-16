/**
 * Client-side parsing of human money input. Kept separate from `money.ts` so
 * forms share one implementation of the "dollars string → integer minor units"
 * conversion, performed entirely in integer space — floating point is banned
 * for monetary math.
 */

/**
 * Parse a dollars string (e.g. "1.25") into integer minor units (cents).
 * The integer and fractional parts are split on "." and combined as integers
 * — no float math. Returns null when the input is not a plain non-negative
 * amount with at most two decimal places.
 */
export function parseDollarsToMinor(input: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2})?)?$/.exec(input.trim());
  const dollarsPart = match?.[1];
  if (dollarsPart === undefined) return null;
  const centsPart = match?.[2];
  const dollars = Number.parseInt(dollarsPart, 10);
  const cents = centsPart !== undefined ? Number.parseInt(centsPart.padEnd(2, "0"), 10) : 0;
  const minor = dollars * 100 + cents;
  return Number.isSafeInteger(minor) ? minor : null;
}
