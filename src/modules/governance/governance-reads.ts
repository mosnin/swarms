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
  skillVersionId: string | null;
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
      skillVersionId: schema.jobs.skillVersionId,
      costMinor: schema.jobs.costMinor,
      costCurrency: schema.jobs.costCurrency,
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
  return rows;
}
