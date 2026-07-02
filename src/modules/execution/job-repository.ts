/**
 * Postgres-backed {@link JobStore} adapter plus the request-facing orchestration
 * for the Swarms execution API. The orchestration layer is where auth guards,
 * capability resolution, budget reservation (append-only ledger hold), audit
 * writes, and queueing are composed around the storage-agnostic core in
 * `job-service.ts`.
 */

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import {
  requireOrganization,
  requirePermission,
  type AuthContext,
} from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import {
  approveJob as approveJobCore,
  cancelJob as cancelJobCore,
  type JobLogRecord,
  type JobRecord,
  type JobStatus,
  type JobStore,
} from "@/modules/execution/job-service";
import { checkAndReserveBudget } from "@/server/budget/checkAndReserve";
import { releaseBudget } from "@/server/budget/releaseBudget";
import { getJobQueue } from "@/server/queue/queue";

type Db = ReturnType<typeof getDb>;
type JobRow = typeof schema.jobs.$inferSelect;
type LogRow = typeof schema.executionLogs.$inferSelect;

function toJobRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    createdByUserId: row.createdByUserId,
    apiKeyId: row.apiKeyId,
    capabilityKind: row.capabilityKind as JobRecord["capabilityKind"],
    task: row.task,
    resourceBundleId: row.resourceBundleId,
    model: row.model,
    idempotencyKey: row.idempotencyKey,
    inputHash: row.inputHash,
    input: row.input,
    callbackUrl: row.callbackUrl,
    output: row.output,
    error: row.error,
    status: row.status as JobStatus,
    priority: row.priority,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    costMinor: row.costMinor,
    costCurrency: row.costCurrency,
    queuedAt: row.queuedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLogRecord(row: LogRow): JobLogRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    jobId: row.jobId,
    level: row.level,
    message: row.message,
    data: row.data,
    loggedAt: row.loggedAt,
  };
}

export function dbJobStore(db: Db = getDb()): JobStore {
  return {
    async findByIdempotencyKey(organizationId, key) {
      const row = (
        await db
          .select()
          .from(schema.jobs)
          .where(and(eq(schema.jobs.organizationId, organizationId), eq(schema.jobs.idempotencyKey, key)))
          .limit(1)
      )[0];
      return row ? toJobRecord(row) : null;
    },
    async insert(record) {
      const inserted = (
        await db
          .insert(schema.jobs)
          .values({
            id: record.id,
            organizationId: record.organizationId,
            createdByUserId: record.createdByUserId,
            apiKeyId: record.apiKeyId,
            capabilityKind: record.capabilityKind,
            task: record.task,
            resourceBundleId: record.resourceBundleId,
            model: record.model,
            idempotencyKey: record.idempotencyKey,
            inputHash: record.inputHash,
            input: record.input,
            callbackUrl: record.callbackUrl,
            status: record.status,
            priority: record.priority,
            attempt: record.attempt,
            maxAttempts: record.maxAttempts,
            costMinor: record.costMinor,
            costCurrency: record.costCurrency,
            queuedAt: record.queuedAt,
          })
          .returning()
      )[0];
      if (!inserted) throw Errors.internal("Failed to insert job");
      return toJobRecord(inserted);
    },
    async findById(id) {
      const row = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1))[0];
      return row ? toJobRecord(row) : null;
    },
    async update(id, patch) {
      const row = (
        await db.update(schema.jobs).set(patch).where(eq(schema.jobs.id, id)).returning()
      )[0];
      if (!row) throw Errors.internal("Failed to update job");
      return toJobRecord(row);
    },
    async compareAndUpdate(id, expectedStatus, patch) {
      const row = (
        await db
          .update(schema.jobs)
          .set(patch)
          .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, expectedStatus)))
          .returning()
      )[0];
      return row ? toJobRecord(row) : null;
    },
    async appendLog(record) {
      const row = (
        await db
          .insert(schema.executionLogs)
          .values({
            id: record.id,
            organizationId: record.organizationId,
            jobId: record.jobId,
            level: record.level,
            message: record.message,
            data: record.data ?? null,
            loggedAt: record.loggedAt,
          })
          .returning()
      )[0];
      if (!row) throw Errors.internal("Failed to append execution log");
      return toLogRecord(row);
    },
    async listLogs(jobId, organizationId) {
      const conds = organizationId
        ? and(eq(schema.executionLogs.jobId, jobId), eq(schema.executionLogs.organizationId, organizationId))
        : eq(schema.executionLogs.jobId, jobId);
      const rows = await db
        .select()
        .from(schema.executionLogs)
        .where(conds)
        .orderBy(asc(schema.executionLogs.loggedAt));
      return rows.map(toLogRecord);
    },
  };
}

export interface JobView {
  id: string;
  status: JobStatus;
  capabilityKind: string;
  input: unknown;
  output: unknown;
  error: unknown;
  costMinor: number;
  costCurrency: string;
  createdAt: string;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

async function loadJobInOrg(ctx: AuthContext, jobId: string, db: Db): Promise<JobRecord> {
  const job = await dbJobStore(db).findById(jobId);
  if (!job) throw Errors.notFound("Job not found");
  requireOrganization(ctx, job.organizationId);
  return job;
}

export async function getJob(ctx: AuthContext, jobId: string, db: Db = getDb()): Promise<JobView> {
  requirePermission(ctx, "jobs.read");
  const job = await loadJobInOrg(ctx, jobId, db);
  return {
    id: job.id,
    status: job.status,
    capabilityKind: job.capabilityKind,
    input: job.input,
    output: job.output,
    error: job.error,
    costMinor: job.costMinor,
    costCurrency: job.costCurrency,
    createdAt: job.createdAt.toISOString(),
    queuedAt: job.queuedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

export interface JobLogView {
  level: string;
  message: string;
  data: unknown;
  loggedAt: string;
}

export async function getJobLogs(
  ctx: AuthContext,
  jobId: string,
  db: Db = getDb(),
): Promise<JobLogView[]> {
  requirePermission(ctx, "jobs.read");
  await loadJobInOrg(ctx, jobId, db);
  const logs = await dbJobStore(db).listLogs(jobId, ctx.organizationId);
  return logs.map((l) => ({
    level: l.level,
    message: l.message,
    data: l.data,
    loggedAt: l.loggedAt.toISOString(),
  }));
}

export async function cancelJob(
  ctx: AuthContext,
  jobId: string,
  db: Db = getDb(),
): Promise<JobView> {
  requirePermission(ctx, "jobs.cancel");
  await loadJobInOrg(ctx, jobId, db);
  const cancelled = await cancelJobCore(dbJobStore(db), jobId);

  // Release any outstanding reservation hold for the cancelled job.
  await releaseBudget(
    { organizationId: ctx.organizationId, jobId, currency: cancelled.costCurrency },
    db,
  );
  await writeAudit(ctx, {
    action: "job.cancelled",
    resourceType: "job",
    resourceId: jobId,
    after: { status: cancelled.status },
  }, db);

  return {
    id: cancelled.id,
    status: cancelled.status,
    capabilityKind: cancelled.capabilityKind,
    input: cancelled.input,
    output: cancelled.output,
    error: cancelled.error,
    costMinor: cancelled.costMinor,
    costCurrency: cancelled.costCurrency,
    createdAt: cancelled.createdAt.toISOString(),
    queuedAt: cancelled.queuedAt?.toISOString() ?? null,
    startedAt: cancelled.startedAt?.toISOString() ?? null,
    finishedAt: cancelled.finishedAt?.toISOString() ?? null,
  };
}

/** Approve a job awaiting approval, reserve its budget, and enqueue it. */
export async function approveJob(
  ctx: AuthContext,
  jobId: string,
  db: Db = getDb(),
): Promise<JobView> {
  requirePermission(ctx, "policies.manage");
  const job = await loadJobInOrg(ctx, jobId, db);

  // Reconstruct the estimated cost from the stored execution input (costMinor is
  // 0 until the job actually runs). This is the same estimate the worker uses.
  const input = (job.input ?? {}) as { maxGpuSeconds?: number; rateMinorPerSecond?: number };
  const estimateMinor = Math.max(
    0,
    Math.floor((input.maxGpuSeconds ?? 0) * (input.rateMinorPerSecond ?? 0)),
  );

  // Approval bypassed reservation at spawn time, so reserve now — atomically,
  // under the budget row lock — before enqueueing. Without this, an approved
  // job runs with no outstanding hold and the hard ceiling undercounts it.
  await checkAndReserveBudget(
    {
      organizationId: ctx.organizationId,
      jobId: job.id,
      amountMinor: estimateMinor,
      currency: job.costCurrency,
      context: { apiKeyId: job.apiKeyId, userId: job.createdByUserId },
    },
    db,
  );

  const queued = await approveJobCore(dbJobStore(db), getJobQueue(), jobId);
  await writeAudit(ctx, {
    action: "job.approved",
    resourceType: "job",
    resourceId: jobId,
    after: { status: queued.status },
  }, db);

  return {
    id: queued.id,
    status: queued.status,
    capabilityKind: queued.capabilityKind,
    input: queued.input,
    output: queued.output,
    error: queued.error,
    costMinor: queued.costMinor,
    costCurrency: queued.costCurrency,
    createdAt: queued.createdAt.toISOString(),
    queuedAt: queued.queuedAt?.toISOString() ?? null,
    startedAt: queued.startedAt?.toISOString() ?? null,
    finishedAt: queued.finishedAt?.toISOString() ?? null,
  };
}
