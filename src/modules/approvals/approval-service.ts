/**
 * Human-in-the-loop approvals. When a governance policy returns
 * `require_approval`, the spend is created in `awaiting_approval` and NOT
 * enqueued (single agent job, swarm director, or simulation director). This
 * service is the inbox: list what's pending, then approve (enqueue it) or reject
 * (cancel it). Approval is a HUMAN action — an agent principal cannot approve
 * its own gated spend.
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { Errors } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { requireOrganization, requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { approveJob, cancelJob } from "@/modules/execution/job-service";
import { dbJobStore } from "@/modules/execution/job-repository";
import { fanOutWebhook } from "@/modules/webhooks/webhook-service";
import { getJobQueue } from "@/server/queue/queue";

type Db = ReturnType<typeof getDb>;

export interface PendingApprovalView {
  jobId: string;
  capabilityKind: string;
  task: string | null;
  estimatedCostMinor: number;
  currency: string;
  /** The swarm/simulation run this director gates, when applicable. */
  runId: string | null;
  createdAt: string;
}

function estimatedCost(job: typeof schema.jobs.$inferSelect): number {
  // Agent/simulation directors carry the estimate in priceMinor via input; the
  // swarm director is cost-0 (workers carry spend) so surface the aggregate.
  const input = (job.input ?? {}) as { budgetMinor?: number };
  return job.costMinor > 0 ? job.costMinor : (input.budgetMinor ?? 0);
}

function runIdOf(job: typeof schema.jobs.$inferSelect): string | null {
  const input = (job.input ?? {}) as { existingRunId?: string; existingEvaluationId?: string };
  return input.existingRunId ?? input.existingEvaluationId ?? null;
}

export async function listPendingApprovals(
  ctx: AuthContext,
  opts: { limit?: number } = {},
  db: Db = getDb(),
): Promise<PendingApprovalView[]> {
  requirePermission(ctx, "jobs.read");
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.organizationId, ctx.organizationId), eq(schema.jobs.status, "awaiting_approval")))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(limit);
  return rows.map((job) => ({
    jobId: job.id,
    capabilityKind: job.capabilityKind,
    task: job.task,
    estimatedCostMinor: estimatedCost(job),
    currency: job.costCurrency,
    runId: runIdOf(job),
    createdAt: job.createdAt.toISOString(),
  }));
}

/** Guard: approvals/rejections are human decisions, never agent self-approval. */
function requireHuman(ctx: AuthContext): void {
  requirePermission(ctx, "jobs.create");
  if (ctx.actor.kind !== "user") {
    throw Errors.forbidden("Approvals are a human action; an API-key/agent principal cannot approve gated spend");
  }
}

async function loadGatedJob(ctx: AuthContext, jobId: string, db: Db): Promise<typeof schema.jobs.$inferSelect> {
  const job = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).limit(1))[0];
  if (!job) throw Errors.notFound("Job not found");
  requireOrganization(ctx, job.organizationId);
  if (job.status !== "awaiting_approval") {
    throw Errors.conflict(`Job is ${job.status}, not awaiting approval`);
  }
  return job;
}

/** Flip the gated director's run row to a new status (swarm/simulation only). */
async function setRunStatus(
  job: typeof schema.jobs.$inferSelect,
  status: "queued" | "cancelled",
  db: Db,
): Promise<void> {
  const runId = runIdOf(job);
  if (!runId) return;
  if (job.capabilityKind === "swarm") {
    await db.update(schema.swarmRuns).set({ status }).where(eq(schema.swarmRuns.id, runId));
  } else if (job.capabilityKind === "simulation") {
    await db.update(schema.simulationRuns).set({ status }).where(eq(schema.simulationRuns.id, runId));
  } else if (job.capabilityKind === "evaluation") {
    await db.update(schema.evaluations).set({ status }).where(eq(schema.evaluations.id, runId));
  }
}

/** Approve a gated job: enqueue it (and flip its run to queued if a director). */
export async function approveGatedJob(
  ctx: AuthContext,
  jobId: string,
  db: Db = getDb(),
): Promise<{ jobId: string; status: string }> {
  requireHuman(ctx);
  const job = await loadGatedJob(ctx, jobId, db);

  const approved = await approveJob(dbJobStore(db), getJobQueue(), jobId);
  await setRunStatus(job, "queued", db);
  await writeAudit(ctx, { action: "approval.approved", resourceType: "job", resourceId: jobId, after: { capabilityKind: job.capabilityKind } }, db);
  fanOutWebhook(
    { organizationId: job.organizationId, jobId, eventType: "approval.approved", data: { jobId, capabilityKind: job.capabilityKind } },
    db,
  ).catch(() => undefined);
  return { jobId: approved.id, status: approved.status };
}

/** Reject a gated job: cancel it (and flip its run to cancelled if a director). */
export async function rejectGatedJob(
  ctx: AuthContext,
  jobId: string,
  reason: string | undefined,
  db: Db = getDb(),
): Promise<{ jobId: string; status: string }> {
  requireHuman(ctx);
  const job = await loadGatedJob(ctx, jobId, db);

  const cancelled = await cancelJob(dbJobStore(db), jobId);
  await setRunStatus(job, "cancelled", db);
  await writeAudit(ctx, { action: "approval.rejected", resourceType: "job", resourceId: jobId, after: { reason: reason ?? null } }, db);
  fanOutWebhook(
    { organizationId: job.organizationId, jobId, eventType: "approval.rejected", data: { jobId, reason: reason ?? null } },
    db,
  ).catch(() => undefined);
  return { jobId: cancelled.id, status: cancelled.status };
}
