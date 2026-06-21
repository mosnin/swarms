/**
 * Pre-flight budget check. For each hard-stop budget on the organization that
 * APPLIES to this request (org-wide or matching the request's scope — api key,
 * user, or skill), compute the amount already committed + reserved in the
 * current period within that scope, and reject if charging `requestedMinor` more
 * would exceed the limit. Non-hard-stop budgets are advisory and never block.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { wouldExceed } from "@/server/budget/budgetMath";
import { periodStart, scopedEntriesSince } from "@/server/budget/ledgerQueries";
import { budgetApplies, parseScope, type BudgetContext } from "@/server/budget/scope";

type Db = ReturnType<typeof getDb>;
type Period = "once" | "daily" | "weekly" | "monthly";

export async function checkBudget(
  organizationId: string,
  requestedMinor: number,
  currency: string,
  db: Db = getDb(),
  context: BudgetContext = {},
): Promise<void> {
  if (requestedMinor <= 0) return;

  const budgets = await db
    .select()
    .from(schema.budgets)
    .where(and(eq(schema.budgets.organizationId, organizationId), eq(schema.budgets.hardStop, true)));

  for (const budget of budgets) {
    if (budget.currency !== currency.toUpperCase()) continue;
    const scope = parseScope(budget.scope);
    if (!budgetApplies(scope, context)) continue;

    const since = periodStart(budget.period as Period);
    const entries = await scopedEntriesSince(organizationId, since, scope, db);
    if (wouldExceed(budget.limitMinor, entries, requestedMinor)) {
      throw Errors.budgetExceeded(`Budget "${budget.name}" would be exceeded`, {
        budgetId: budget.id,
        limitMinor: budget.limitMinor,
        requestedMinor,
        scope: scope as Record<string, unknown>,
      });
    }
  }
}
