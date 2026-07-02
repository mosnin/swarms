/**
 * Reserve budget for a job by appending an append-only hold entry. The hold
 * counts against budgets until it is committed (charge + release) or released
 * (on cancel/failure).
 */

import { getDb } from "@/lib/db";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";

type Db = ReturnType<typeof getDb>;

export async function reserveBudget(
  params: { organizationId: string; jobId: string; amountMinor: number; currency: string },
  db: Db = getDb(),
): Promise<void> {
  if (params.amountMinor <= 0) return;
  await appendEntry(dbLedgerStore(db), {
    organizationId: params.organizationId,
    jobId: params.jobId,
    direction: "debit",
    kind: "hold",
    amountMinor: params.amountMinor,
    currency: params.currency,
    description: "Budget reservation",
    refType: "job",
    refId: params.jobId,
  });
}
