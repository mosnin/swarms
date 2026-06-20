/**
 * Ledger read helpers backing the budget engine. Reservations and usage are all
 * append-only ledger entries; these queries derive budget state from them.
 */

import { and, eq, gte } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { LedgerDirection, LedgerEntryKind } from "@/modules/billing/ledger-service";
import { reservedMinor, type BudgetLedgerEntry } from "@/server/budget/budgetMath";

type Db = ReturnType<typeof getDb>;

function toEntry(row: { direction: string; kind: string; amountMinor: number }): BudgetLedgerEntry {
  return {
    direction: row.direction as LedgerDirection,
    kind: row.kind as LedgerEntryKind,
    amountMinor: row.amountMinor,
  };
}

/** All ledger entries for an organization since `since` (period start). */
export async function entriesForOrgSince(
  organizationId: string,
  since: Date,
  db: Db = getDb(),
): Promise<BudgetLedgerEntry[]> {
  const rows = await db
    .select({
      direction: schema.usageLedgerEntries.direction,
      kind: schema.usageLedgerEntries.kind,
      amountMinor: schema.usageLedgerEntries.amountMinor,
    })
    .from(schema.usageLedgerEntries)
    .where(
      and(
        eq(schema.usageLedgerEntries.organizationId, organizationId),
        gte(schema.usageLedgerEntries.createdAt, since),
      ),
    );
  return rows.map(toEntry);
}

/** Ledger entries scoped to a single job. */
export async function entriesForJob(jobId: string, db: Db = getDb()): Promise<BudgetLedgerEntry[]> {
  const rows = await db
    .select({
      direction: schema.usageLedgerEntries.direction,
      kind: schema.usageLedgerEntries.kind,
      amountMinor: schema.usageLedgerEntries.amountMinor,
    })
    .from(schema.usageLedgerEntries)
    .where(eq(schema.usageLedgerEntries.jobId, jobId));
  return rows.map(toEntry);
}

/** Outstanding (un-released) reservation hold for a job, in minor units. */
export async function outstandingHoldMinor(jobId: string, db: Db = getDb()): Promise<number> {
  return reservedMinor(await entriesForJob(jobId, db));
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
