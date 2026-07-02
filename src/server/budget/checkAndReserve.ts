/**
 * Atomic check-and-reserve. The budget ceiling must hold under concurrency: a
 * naive `checkBudget` then `reserveBudget` is a TOCTOU race — two concurrent
 * spawns can both pass the check before either's hold lands, over-committing
 * past a hard-stop cap.
 *
 * This serializes concurrent reservations by locking the applicable hard-stop
 * budget rows `FOR UPDATE` inside a single transaction, recomputing spend under
 * that lock, and appending the reservation hold in the same transaction. The
 * second reservation blocks until the first commits, then sees its hold.
 *
 * When no hard-stop budget applies there is no ceiling to protect, so no lock is
 * needed and the hold is simply appended.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";
import { wouldExceed } from "@/server/budget/budgetMath";
import { periodStart, scopedEntriesSince } from "@/server/budget/ledgerQueries";
import { budgetApplies, parseScope, type BudgetContext } from "@/server/budget/scope";

type Db = ReturnType<typeof getDb>;
type Period = "once" | "daily" | "weekly" | "monthly";

export async function checkAndReserveBudget(
  params: {
    organizationId: string;
    jobId: string;
    amountMinor: number;
    currency: string;
    context?: BudgetContext;
  },
  db: Db = getDb(),
): Promise<void> {
  if (params.amountMinor <= 0) return;
  const currency = params.currency.toUpperCase();
  const context = params.context ?? {};

  await db.transaction(async (tx) => {
    // Lock the org's hard-stop budgets so concurrent reservations serialize on
    // these rows; the second caller waits until the first commits its hold.
    const budgets = await tx
      .select()
      .from(schema.budgets)
      .where(
        and(
          eq(schema.budgets.organizationId, params.organizationId),
          eq(schema.budgets.hardStop, true),
        ),
      )
      .for("update");

    for (const budget of budgets) {
      if (budget.currency !== currency) continue;
      const scope = parseScope(budget.scope);
      if (!budgetApplies(scope, context)) continue;

      const since = periodStart(budget.period as Period);
      const entries = await scopedEntriesSince(
        params.organizationId,
        since,
        scope,
        tx as Db,
        currency,
      );
      if (wouldExceed(budget.limitMinor, entries, params.amountMinor)) {
        throw Errors.budgetExceeded(`Budget "${budget.name}" would be exceeded`, {
          budgetId: budget.id,
          limitMinor: budget.limitMinor,
          requestedMinor: params.amountMinor,
          scope: scope as Record<string, unknown>,
        });
      }
    }

    // Append the hold in the SAME transaction so it is visible to the next
    // reservation the instant this one commits.
    await appendEntry(dbLedgerStore(tx as Db), {
      organizationId: params.organizationId,
      jobId: params.jobId,
      direction: "debit",
      kind: "hold",
      amountMinor: params.amountMinor,
      currency,
      description: "Budget reservation",
      refType: "job",
      refId: params.jobId,
    });
  });
}
