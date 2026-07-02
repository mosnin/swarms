/**
 * Commit the actual usage of a completed job: append the usage charge and
 * release any outstanding reservation hold, so the budget reflects committed
 * spend only (no lingering double-count from the reservation).
 */

import { getDb } from "@/lib/db";
import { releaseBudget } from "@/server/budget/releaseBudget";

type Db = ReturnType<typeof getDb>;

export async function commitBudget(
  params: {
    organizationId: string;
    jobId: string;
    amountMinor: number;
    currency: string;
    refType?: string;
    refId?: string;
  },
  db: Db = getDb(),
): Promise<void> {
  // Charge + release are a single logical operation: if the DB fails between
  // them the hold would leak. Wrapping in a transaction guarantees atomicity.
  await db.transaction(async (tx) => {
    if (params.amountMinor > 0) {
      // ON CONFLICT DO NOTHING: a job that is re-delivered after a crash (when
      // the job row is already "succeeded") must not be charged a second time.
      // The unique partial index ledger_job_charge_uq enforces at-most-one
      // charge per job; we honour that here by silently skipping duplicates.
      await tx
        .insert((await import("@/lib/db/schema")).usageLedgerEntries)
        .values({
          organizationId: params.organizationId,
          jobId: params.jobId,
          direction: "debit",
          kind: "charge",
          amountMinor: params.amountMinor,
          currency: params.currency,
          description: "Capability execution charge",
          refType: params.refType ?? "job",
          refId: params.refId ?? params.jobId,
        })
        .onConflictDoNothing();
    }
    // Free the reservation regardless of whether the charge was new or a dup.
    await releaseBudget(
      { organizationId: params.organizationId, jobId: params.jobId, currency: params.currency },
      tx as Db,
    );
  });
}
