/**
 * Pure budget arithmetic over append-only ledger entries. All amounts are
 * integer minor units. "Spent" against a budget is the sum of committed charges
 * plus still-outstanding reservations (holds net of releases), so a budget can
 * never be over-committed by concurrent in-flight jobs.
 */

import type { LedgerDirection, LedgerEntryKind } from "@/modules/billing/ledger-service";

export interface BudgetLedgerEntry {
  direction: LedgerDirection;
  kind: LedgerEntryKind;
  amountMinor: number;
}

/** Sum of committed usage charges (debit + charge). */
export function committedMinor(entries: readonly BudgetLedgerEntry[]): number {
  return entries
    .filter((e) => e.direction === "debit" && e.kind === "charge")
    .reduce((acc, e) => acc + e.amountMinor, 0);
}

/** Outstanding reservations: holds (debit) minus releases (credit). Never < 0. */
export function reservedMinor(entries: readonly BudgetLedgerEntry[]): number {
  const holds = entries
    .filter((e) => e.direction === "debit" && e.kind === "hold")
    .reduce((acc, e) => acc + e.amountMinor, 0);
  const releases = entries
    .filter((e) => e.direction === "credit" && e.kind === "release")
    .reduce((acc, e) => acc + e.amountMinor, 0);
  return Math.max(0, holds - releases);
}

/** Total amount counted against the budget limit. */
export function spentMinor(entries: readonly BudgetLedgerEntry[]): number {
  return committedMinor(entries) + reservedMinor(entries);
}

/** Remaining headroom (may be negative if already over). */
export function availableMinor(limitMinor: number, entries: readonly BudgetLedgerEntry[]): number {
  return limitMinor - spentMinor(entries);
}

/** Whether charging `requestedMinor` more would exceed the limit. */
export function wouldExceed(
  limitMinor: number,
  entries: readonly BudgetLedgerEntry[],
  requestedMinor: number,
): boolean {
  return spentMinor(entries) + requestedMinor > limitMinor;
}
