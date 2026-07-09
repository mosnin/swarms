/**
 * Ledger read helpers backing the budget engine. Reservations and usage are all
 * append-only ledger entries; these queries derive budget state from them.
 */

import { and, eq, gte, inArray, or, type SQL } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { LedgerDirection, LedgerEntryKind } from "@/modules/billing/ledger-service";
import { reservedMinor, type BudgetLedgerEntry } from "@/server/budget/budgetMath";
import { isScoped, type BudgetScope } from "@/server/budget/scope";

type Db = ReturnType<typeof getDb>;

function toEntry(row: { direction: string; kind: string; amountMinor: number; currency: string }): BudgetLedgerEntry {
  return {
    direction: row.direction as LedgerDirection,
    kind: row.kind as LedgerEntryKind,
    amountMinor: row.amountMinor,
    currency: row.currency,
  };
}

/** All ledger entries for an organization since `since` (period start), filtered by currency. */
export async function entriesForOrgSince(
  organizationId: string,
  since: Date,
  db: Db = getDb(),
  currency?: string,
): Promise<BudgetLedgerEntry[]> {
  const conds: SQL[] = [
    eq(schema.usageLedgerEntries.organizationId, organizationId),
    gte(schema.usageLedgerEntries.createdAt, since),
  ];
  if (currency) conds.push(eq(schema.usageLedgerEntries.currency, currency.toUpperCase()));

  const rows = await db
    .select({
      direction: schema.usageLedgerEntries.direction,
      kind: schema.usageLedgerEntries.kind,
      amountMinor: schema.usageLedgerEntries.amountMinor,
      currency: schema.usageLedgerEntries.currency,
    })
    .from(schema.usageLedgerEntries)
    .where(and(...conds));
  return rows.map(toEntry);
}

/**
 * Ledger entries for an organization since `since`, narrowed to a budget scope.
 * Org-wide scopes use the cheap path; constrained scopes join through `jobs` so
 * per-key / per-user budgets are computed from the same append-only ledger.
 */
export async function scopedEntriesSince(
  organizationId: string,
  since: Date,
  scope: BudgetScope,
  db: Db = getDb(),
  currency?: string,
): Promise<BudgetLedgerEntry[]> {
  // Budget spend = committed charges IN THE PERIOD + reservations still
  // outstanding RIGHT NOW. Charges are period-windowed, but a hold/release must
  // be counted all-time: a hold placed just before the window and released just
  // inside it would otherwise leave a windowed release with no matching hold,
  // dragging `reservedMinor` down and letting a fresh reservation breach the
  // ceiling. So: charges >= since, OR any hold/release regardless of time.
  const periodOrOutstanding = or(
    and(eq(schema.usageLedgerEntries.kind, "charge"), gte(schema.usageLedgerEntries.createdAt, since)),
    inArray(schema.usageLedgerEntries.kind, ["hold", "release"]),
  )!;
  const base: SQL[] = [eq(schema.usageLedgerEntries.organizationId, organizationId), periodOrOutstanding];
  if (currency) base.push(eq(schema.usageLedgerEntries.currency, currency.toUpperCase()));

  const select = {
    direction: schema.usageLedgerEntries.direction,
    kind: schema.usageLedgerEntries.kind,
    amountMinor: schema.usageLedgerEntries.amountMinor,
    currency: schema.usageLedgerEntries.currency,
  };

  if (!isScoped(scope)) {
    const rows = await db.select(select).from(schema.usageLedgerEntries).where(and(...base));
    return rows.map(toEntry);
  }

  const conds = [...base];
  if (scope.apiKeyId) conds.push(eq(schema.jobs.apiKeyId, scope.apiKeyId));
  if (scope.userId) conds.push(eq(schema.jobs.createdByUserId, scope.userId));

  const rows = await db
    .select(select)
    .from(schema.usageLedgerEntries)
    .innerJoin(schema.jobs, eq(schema.usageLedgerEntries.jobId, schema.jobs.id))
    .where(and(...conds));

  return rows.map(toEntry);
}

/** Ledger entries scoped to a single job, optionally filtered by currency. */
export async function entriesForJob(
  jobId: string,
  db: Db = getDb(),
  currency?: string,
): Promise<BudgetLedgerEntry[]> {
  const conds: SQL[] = [eq(schema.usageLedgerEntries.jobId, jobId)];
  if (currency) conds.push(eq(schema.usageLedgerEntries.currency, currency.toUpperCase()));

  const rows = await db
    .select({
      direction: schema.usageLedgerEntries.direction,
      kind: schema.usageLedgerEntries.kind,
      amountMinor: schema.usageLedgerEntries.amountMinor,
      currency: schema.usageLedgerEntries.currency,
    })
    .from(schema.usageLedgerEntries)
    .where(and(...conds));
  return rows.map(toEntry);
}

/** Outstanding (un-released) reservation hold for a job, in minor units. */
export async function outstandingHoldMinor(
  jobId: string,
  db: Db = getDb(),
  currency?: string,
): Promise<number> {
  return reservedMinor(await entriesForJob(jobId, db, currency));
}

/** Start of the current budget period (UTC). */
export function periodStart(period: "once" | "daily" | "weekly" | "monthly", now = new Date()): Date {
  switch (period) {
    case "once":
      return new Date(0);
    case "daily":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    case "weekly": {
      const day = now.getUTCDay();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      start.setUTCDate(start.getUTCDate() - day);
      return start;
    }
    case "monthly":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
}
