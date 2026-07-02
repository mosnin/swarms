/**
 * Budget threshold alerts. After each chargeable action completes, call
 * `computeBudgetAlerts` to determine whether the organisation has crossed
 * a 80% (warning) or 100% (exceeded) threshold on any configured budget.
 * Only the highest-severity threshold is returned per budget — "exceeded"
 * suppresses "warning" when spend ≥ 100%.
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { spentMinor } from "@/server/budget/budgetMath";
import { periodStart, scopedEntriesSince } from "@/server/budget/ledgerQueries";
import { parseScope } from "@/server/budget/scope";

type Db = ReturnType<typeof getDb>;
type Period = "once" | "daily" | "weekly" | "monthly";

export interface BudgetAlert {
  budgetId: string;
  budgetName: string;
  /** Threshold ratio that triggered this alert: 0.8 or 1.0. */
  threshold: number;
  level: "warning" | "exceeded";
  spentMinor: number;
  limitMinor: number;
  currency: string;
  period: string;
  /** Percentage of budget consumed (0–100+), rounded to 2 decimal places. */
  usagePercent: number;
}

const THRESHOLDS: Array<{ ratio: number; level: "warning" | "exceeded" }> = [
  { ratio: 1.0, level: "exceeded" },
  { ratio: 0.8, level: "warning" },
];

/**
 * Return one alert per budget whose current-period spend has crossed a
 * threshold (80% or 100%). If no budgets are configured, returns [].
 * Filters to `currency` so multi-currency orgs get correct alerts.
 */
export async function computeBudgetAlerts(
  organizationId: string,
  currency: string,
  db: Db = getDb(),
): Promise<BudgetAlert[]> {
  const budgets = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.organizationId, organizationId));

  const alerts: BudgetAlert[] = [];

  for (const budget of budgets) {
    if (budget.currency !== currency.toUpperCase()) continue;

    const scope = parseScope(budget.scope);
    const since = periodStart(budget.period as Period);
    const entries = await scopedEntriesSince(organizationId, since, scope, db, currency);
    const spent = spentMinor(entries);
    const usagePercent =
      budget.limitMinor > 0
        ? Math.round((spent / budget.limitMinor) * 10000) / 100
        : 0;

    for (const { ratio, level } of THRESHOLDS) {
      if (spent >= budget.limitMinor * ratio) {
        alerts.push({
          budgetId: budget.id,
          budgetName: budget.name,
          threshold: ratio,
          level,
          spentMinor: spent,
          limitMinor: budget.limitMinor,
          currency: budget.currency,
          period: budget.period,
          usagePercent,
        });
        break; // highest severity only per budget
      }
    }
  }

  return alerts;
}
