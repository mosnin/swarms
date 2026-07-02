/**
 * Org-scoped read helpers for the governance dashboard (budgets, policies,
 * pending approvals). All reads require an authenticated context and the
 * appropriate permission.
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";

type Db = ReturnType<typeof getDb>;

export async function listBudgets(ctx: AuthContext, db: Db = getDb()) {
  requirePermission(ctx, "billing.read");
  return db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.organizationId, ctx.organizationId))
    .orderBy(desc(schema.budgets.createdAt));
}

export async function listPolicies(ctx: AuthContext, db: Db = getDb()) {
  requirePermission(ctx, "audit.read");
  return db
    .select()
    .from(schema.policyRules)
    .where(eq(schema.policyRules.organizationId, ctx.organizationId))
    .orderBy(desc(schema.policyRules.priority));
}

export interface PendingApproval {
  id: string;
  costMinor: number;
  costCurrency: string;
  createdAt: Date;
}

export async function listPendingApprovals(
  ctx: AuthContext,
  db: Db = getDb(),
): Promise<PendingApproval[]> {
  requirePermission(ctx, "jobs.read");
  const rows = await db
    .select({
      id: schema.jobs.id,
      costMinor: schema.jobs.costMinor,
      costCurrency: schema.jobs.costCurrency,
      input: schema.jobs.input,
      createdAt: schema.jobs.createdAt,
    })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.organizationId, ctx.organizationId),
        eq(schema.jobs.status, "awaiting_approval"),
      ),
    )
    .orderBy(desc(schema.jobs.createdAt));
  return rows.map(({ input, costMinor, ...r }) => {
    // costMinor is 0 until the job runs; surface the up-front estimate the
    // approver is authorizing (max GPU-seconds × rate), same as the worker uses.
    const i = (input ?? {}) as { maxGpuSeconds?: number; rateMinorPerSecond?: number };
    const estimateMinor = Math.max(
      0,
      Math.floor((i.maxGpuSeconds ?? 0) * (i.rateMinorPerSecond ?? 0)),
    );
    return { ...r, costMinor: costMinor > 0 ? costMinor : estimateMinor };
  });
}
