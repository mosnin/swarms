/**
 * Ledger reconciliation. Verifies that the append-only usage ledger agrees with
 * the source records it is derived from — every payment receipt has a matching
 * `payment` ledger credit, and every succeeded paid job has a `charge`. Surfaces
 * drift for dispute resolution and monitoring. The comparison core is pure.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";

export interface Discrepancy {
  kind: "missing_payment_entry" | "payment_amount_mismatch" | "missing_charge_entry";
  receiptId?: string;
  jobId?: string;
  expectedMinor?: number;
  foundMinor?: number;
}

export interface ReceiptLite {
  id: string;
  jobId: string | null;
  amountMinor: number;
}
export interface ChargeableJobLite {
  id: string;
  costMinor: number;
}
export interface LedgerLite {
  kind: string;
  refType: string | null;
  refId: string | null;
  jobId: string | null;
  amountMinor: number;
}

/** Pure reconciliation of receipts + chargeable jobs against ledger entries. */
export function reconcile(
  receipts: readonly ReceiptLite[],
  chargeableJobs: readonly ChargeableJobLite[],
  ledger: readonly LedgerLite[],
): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  for (const receipt of receipts) {
    const entry = ledger.find(
      (e) => e.kind === "payment" && e.refType === "payment_receipt" && e.refId === receipt.id,
    );
    if (!entry) {
      discrepancies.push({ kind: "missing_payment_entry", receiptId: receipt.id });
    } else if (entry.amountMinor !== receipt.amountMinor) {
      discrepancies.push({
        kind: "payment_amount_mismatch",
        receiptId: receipt.id,
        expectedMinor: receipt.amountMinor,
        foundMinor: entry.amountMinor,
      });
    }
  }

  for (const job of chargeableJobs) {
    const charge = ledger.find((e) => e.kind === "charge" && e.jobId === job.id);
    if (!charge) {
      discrepancies.push({ kind: "missing_charge_entry", jobId: job.id, expectedMinor: job.costMinor });
    }
  }

  return discrepancies;
}

export interface ReconciliationReport {
  ok: boolean;
  receiptsChecked: number;
  jobsChecked: number;
  discrepancies: Discrepancy[];
}

/** Reconcile an organization's ledger against its receipts + succeeded jobs. */
export async function reconcileOrganization(
  ctx: AuthContext,
  db: ReturnType<typeof getDb> = getDb(),
): Promise<ReconciliationReport> {
  requirePermission(ctx, "billing.read");
  const org = ctx.organizationId;

  const [receipts, jobs, ledger] = await Promise.all([
    db
      .select({
        id: schema.x402PaymentReceipts.id,
        jobId: schema.x402PaymentReceipts.jobId,
        amountMinor: schema.x402PaymentReceipts.amountMinor,
      })
      .from(schema.x402PaymentReceipts)
      .where(eq(schema.x402PaymentReceipts.organizationId, org)),
    db
      .select({ id: schema.jobs.id, costMinor: schema.jobs.costMinor })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.organizationId, org), eq(schema.jobs.status, "succeeded"))),
    db
      .select({
        kind: schema.usageLedgerEntries.kind,
        refType: schema.usageLedgerEntries.refType,
        refId: schema.usageLedgerEntries.refId,
        jobId: schema.usageLedgerEntries.jobId,
        amountMinor: schema.usageLedgerEntries.amountMinor,
      })
      .from(schema.usageLedgerEntries)
      .where(eq(schema.usageLedgerEntries.organizationId, org)),
  ]);

  const chargeable = jobs.filter((j) => j.costMinor > 0);
  const discrepancies = reconcile(receipts, chargeable, ledger);
  return {
    ok: discrepancies.length === 0,
    receiptsChecked: receipts.length,
    jobsChecked: chargeable.length,
    discrepancies,
  };
}
