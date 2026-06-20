/**
 * Org-scoped dashboard read helpers. All require an authenticated context and a
 * permission; all queries are scoped to the caller's organization.
 */

import { and, count, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { listConnectors } from "@/server/connectors/connectorRegistry";
import { committedMinor } from "@/server/budget/budgetMath";
import { entriesForOrgSince, periodStart } from "@/server/budget/ledgerQueries";

type Db = ReturnType<typeof getDb>;

async function jobCount(db: Db, org: string, status?: string): Promise<number> {
  const where = status
    ? and(eq(schema.jobs.organizationId, org), eq(schema.jobs.status, status as never))
    : eq(schema.jobs.organizationId, org);
  const rows = await db.select({ c: count() }).from(schema.jobs).where(where);
  return rows[0]?.c ?? 0;
}

export interface OverviewMetrics {
  totalJobs: number;
  succeededJobs: number;
  failedJobs: number;
  queuedJobs: number;
  spendThisMonthMinor: number;
  activeSkills: number;
  activeConnectors: number;
  pendingApprovals: number;
  recentAudit: Array<{ action: string; resourceType: string; createdAt: Date }>;
}

export async function overviewMetrics(ctx: AuthContext, db: Db = getDb()): Promise<OverviewMetrics> {
  requirePermission(ctx, "org.read");
  const org = ctx.organizationId;

  const [total, succeeded, failed, queued, skills, approvals, recent, monthEntries] = await Promise.all([
    jobCount(db, org),
    jobCount(db, org, "succeeded"),
    jobCount(db, org, "failed"),
    jobCount(db, org, "awaiting_approval"),
    db.select({ c: count() }).from(schema.skills).where(eq(schema.skills.organizationId, org)),
    db
      .select({ c: count() })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.organizationId, org), eq(schema.jobs.status, "awaiting_approval"))),
    db
      .select({
        action: schema.auditEvents.action,
        resourceType: schema.auditEvents.resourceType,
        createdAt: schema.auditEvents.createdAt,
      })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.organizationId, org))
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(8),
    entriesForOrgSince(org, periodStart("monthly"), db),
  ]);

  return {
    totalJobs: total,
    succeededJobs: succeeded,
    failedJobs: failed,
    queuedJobs: queued,
    spendThisMonthMinor: committedMinor(monthEntries),
    activeSkills: skills[0]?.c ?? 0,
    activeConnectors: listConnectors().length,
    pendingApprovals: approvals[0]?.c ?? 0,
    recentAudit: recent,
  };
}

export async function listJobs(ctx: AuthContext, db: Db = getDb()) {
  requirePermission(ctx, "jobs.read");
  return db
    .select({
      id: schema.jobs.id,
      status: schema.jobs.status,
      capabilityKind: schema.jobs.capabilityKind,
      costMinor: schema.jobs.costMinor,
      costCurrency: schema.jobs.costCurrency,
      createdAt: schema.jobs.createdAt,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.organizationId, ctx.organizationId))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(100);
}

export interface JobDetail {
  job: typeof schema.jobs.$inferSelect;
  logs: Array<typeof schema.executionLogs.$inferSelect>;
  workerRuns: Array<typeof schema.workerRuns.$inferSelect>;
  ledger: Array<typeof schema.usageLedgerEntries.$inferSelect>;
  receipt: typeof schema.x402PaymentReceipts.$inferSelect | null;
}

export async function getJobDetail(
  ctx: AuthContext,
  jobId: string,
  db: Db = getDb(),
): Promise<JobDetail | null> {
  requirePermission(ctx, "jobs.read");
  const job = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1))[0];
  if (!job || job.organizationId !== ctx.organizationId) return null;

  const [logs, workerRuns, ledger, receiptRows] = await Promise.all([
    db.select().from(schema.executionLogs).where(eq(schema.executionLogs.jobId, jobId)).orderBy(schema.executionLogs.loggedAt),
    db.select().from(schema.workerRuns).where(eq(schema.workerRuns.jobId, jobId)),
    db.select().from(schema.usageLedgerEntries).where(eq(schema.usageLedgerEntries.jobId, jobId)),
    db.select().from(schema.x402PaymentReceipts).where(eq(schema.x402PaymentReceipts.jobId, jobId)).limit(1),
  ]);

  return { job, logs, workerRuns, ledger, receipt: receiptRows[0] ?? null };
}

export async function listSwarmRuns(ctx: AuthContext, db: Db = getDb()) {
  requirePermission(ctx, "jobs.read");
  return db
    .select({
      id: schema.swarmRuns.id,
      status: schema.swarmRuns.status,
      costMinor: schema.swarmRuns.costMinor,
      costCurrency: schema.swarmRuns.costCurrency,
      createdAt: schema.swarmRuns.createdAt,
    })
    .from(schema.swarmRuns)
    .where(eq(schema.swarmRuns.organizationId, ctx.organizationId))
    .orderBy(desc(schema.swarmRuns.createdAt))
    .limit(100);
}

export async function listPayments(ctx: AuthContext, db: Db = getDb()) {
  requirePermission(ctx, "billing.read");
  return db
    .select()
    .from(schema.x402PaymentReceipts)
    .where(eq(schema.x402PaymentReceipts.organizationId, ctx.organizationId))
    .orderBy(desc(schema.x402PaymentReceipts.createdAt))
    .limit(100);
}

export async function listLedger(ctx: AuthContext, db: Db = getDb()) {
  requirePermission(ctx, "billing.read");
  return db
    .select()
    .from(schema.usageLedgerEntries)
    .where(eq(schema.usageLedgerEntries.organizationId, ctx.organizationId))
    .orderBy(desc(schema.usageLedgerEntries.createdAt))
    .limit(200);
}
