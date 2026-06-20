/**
 * Commit the actual usage of a completed job: append the usage charge and
 * release any outstanding reservation hold, so the budget reflects committed
 * spend only (no lingering double-count from the reservation).
 */

import { getDb } from "@/lib/db";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";
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
  if (params.amountMinor > 0) {
    await appendEntry(dbLedgerStore(db), {
      organizationId: params.organizationId,
      jobId: params.jobId,
      direction: "debit",
      kind: "charge",
      amountMinor: params.amountMinor,
      currency: params.currency,
      description: "Capability execution charge",
      refType: params.refType ?? "job",
      refId: params.refId ?? params.jobId,
    });
  }
  // Free the reservation now that the real charge is recorded.
  await releaseBudget(
    { organizationId: params.organizationId, jobId: params.jobId, currency: params.currency },
    db,
  );
}
