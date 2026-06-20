/**
 * Release a job's outstanding budget reservation by appending a compensating
 * release entry for the un-committed hold amount. Idempotent in effect: once the
 * outstanding hold is zero, nothing is appended.
 */

import { getDb } from "@/lib/db";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";
import { outstandingHoldMinor } from "@/server/budget/ledgerQueries";

type Db = ReturnType<typeof getDb>;

export async function releaseBudget(
  params: { organizationId: string; jobId: string; currency: string },
  db: Db = getDb(),
): Promise<void> {
  const outstanding = await outstandingHoldMinor(params.jobId, db);
  if (outstanding <= 0) return;
  await appendEntry(dbLedgerStore(db), {
    organizationId: params.organizationId,
    jobId: params.jobId,
    direction: "credit",
    kind: "release",
    amountMinor: outstanding,
    currency: params.currency,
    description: "Release of unused budget reservation",
    refType: "job",
    refId: params.jobId,
  });
}
