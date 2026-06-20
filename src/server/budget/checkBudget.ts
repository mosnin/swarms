/**
 * Pre-flight budget check. For each hard-stop budget on the organization,
 * compute the amount already committed + reserved in the current period and
 * reject the request if charging `requestedMinor` more would exceed the limit.
 * Non-hard-stop budgets are advisory and never block.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { wouldExceed } from "@/server/budget/budgetMath";
import { entriesForOrgSince, periodStart } from "@/server/budget/ledgerQueries";

type Db = ReturnType<typeof getDb>;
type Period = "once" | "daily" | "weekly" | "monthly";

export async function checkBudget(
  organizationId: string,
  requestedMinor: number,
  currency: string,
  db: Db = getDb(),
): Promise<void> {
  if (requestedMinor <= 0) return;

  const budgets = await db
    .select()
    .from(schema.budgets)
    .where(and(eq(schema.budgets.organizationId, organizationId), eq(schema.budgets.hardStop, true)));

  for (const budget of budgets) {
    if (budget.currency !== currency.toUpperCase()) continue;
    const since = periodStart(budget.period as Period);
    const entries = await entriesForOrgSince(organizationId, since, db);
    if (wouldExceed(budget.limitMinor, entries, requestedMinor)) {
      throw Errors.budgetExceeded(`Budget "${budget.name}" would be exceeded`, {
        budgetId: budget.id,
        limitMinor: budget.limitMinor,
        requestedMinor,
      });
    }
  }
}
