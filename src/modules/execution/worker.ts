/**
 * Worker-side wiring: composes the storage-agnostic {@link processJob} core with
 * Postgres-backed stores, capability resolution, and the append-only usage
 * ledger. Exposes a single-job processor and a local queue drain used in
 * development to run the full execution loop without a separate worker process
 * (the standalone worker in Phase 16 reuses the same core).
 */

import { and, asc, eq, lt, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { isRunnerType } from "@/server/runners/runnerRegistry";
import { commitBudget } from "@/server/budget/commitBudget";
import { releaseBudget } from "@/server/budget/releaseBudget";
import { logger } from "@/lib/logger";
import { writeAuditSystem } from "@/modules/governance/audit";
import { enqueueWebhook } from "@/modules/webhooks/webhook-service";
import { dbJobStore } from "@/modules/execution/job-repository";
import type { JobRecord } from "@/modules/execution/job-service";
import {
  processJob,
  type ProcessDeps,
  type ResolvedExecution,
  type WorkerRunRecord,
  type WorkerRunStore,
} from "@/server/jobs/processJob";
import { getJobQueue } from "@/server/queue/queue";

type Db = ReturnType<typeof getDb>;
type WorkerRunRow = typeof schema.workerRuns.$inferSelect;

function toWorkerRun(row: WorkerRunRow): WorkerRunRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    jobId: row.jobId,
    skillVersionId: row.skillVersionId,
    workerId: row.workerId,
    runnerType: row.runnerType,
    status: row.status as JobRecord["status"],
    input: row.input,
    output: row.output,
    error: row.error,
    durationMs: row.durationMs,
    costMinor: row.costMinor,
    costCurrency: row.costCurrency,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

function dbWorkerRunStore(db: Db): WorkerRunStore {
  return {
    async insert(record) {
      const row = (
        await db
          .insert(schema.workerRuns)
          .values({
            id: record.id,
            organizationId: record.organizationId,
            jobId: record.jobId,
            skillVersionId: record.skillVersionId,
            workerId: record.workerId,
            runnerType: record.runnerType,
            status: record.status,
            input: record.input ?? null,
            output: record.output ?? null,
            error: record.error ?? null,
            durationMs: record.durationMs,
            costMinor: record.costMinor,
            costCurrency: record.costCurrency,
            startedAt: record.startedAt,
            finishedAt: record.finishedAt,
          })
          .returning()
      )[0];
      if (!row) throw Errors.internal("Failed to insert worker run");
      return toWorkerRun(row);
    },
    async update(id, patch) {
      const row = (
        await db.update(schema.workerRuns).set(patch).where(eq(schema.workerRuns.id, id)).returning()
      )[0];
      if (!row) throw Errors.internal("Failed to update worker run");
      return toWorkerRun(row);
    },
  };
}

async function resolveExecution(db: Db, job: JobRecord): Promise<ResolvedExecution | null> {
  if (!job.skillVersionId) return null;
  const version = (
    await db
      .select()
      .from(schema.skillVersions)
      .where(eq(schema.skillVersions.id, job.skillVersionId))
      .limit(1)
  )[0];
  if (!version) return null;

  const runnerType = isRunnerType(version.runnerType) ? version.runnerType : "mock";
  const manifest = (version.manifest ?? {}) as { maxRuntimeMs?: unknown };
  const maxRuntimeMs =
    typeof manifest.maxRuntimeMs === "number" && manifest.maxRuntimeMs > 0
      ? manifest.maxRuntimeMs
      : 30_000;

  return {
    runnerType,
    runnerConfig: version.runnerConfig,
    maxRuntimeMs,
    priceMinor: version.priceMinor,
    currency: job.costCurrency || version.priceCurrency,
  };
}

function deps(db: Db, workerId: string): ProcessDeps {
  return {
    jobStore: dbJobStore(db),
    workerRunStore: dbWorkerRunStore(db),
    resolve: (job) => resolveExecution(db, job),
    workerId,
    async onCharge(job, costMinor, currency) {
      // Commit the real usage charge and release the reservation hold so the
      // budget reflects committed spend only (no double count).
      await commitBudget(
        { organizationId: job.organizationId, jobId: job.id, amountMinor: costMinor, currency },
        db,
      );
      await writeAuditSystem(job.organizationId, {
        action: "job.succeeded",
        resourceType: "job",
        resourceId: job.id,
        after: { costMinor, currency },
      }, db);
    },
  };
}

const WORKER_ID = `inproc-${process.pid}`;

/** Process a single job by id using Postgres-backed stores. */
export async function processJobInDb(
  jobId: string,
  db: Db = getDb(),
  opts: { preClaimed?: boolean } = {},
): Promise<JobRecord> {
  const job = await processJob(deps(db, WORKER_ID), jobId, opts);
  // A failed job never charges; release its reservation hold.
  if (job.status === "failed") {
    await releaseBudget(
      { organizationId: job.organizationId, jobId: job.id, currency: job.costCurrency },
      db,
    ).catch(() => undefined);
  }
  // Emit a webhook for terminal states when the caller subscribed.
  if (job.callbackUrl && (job.status === "succeeded" || job.status === "failed")) {
    await enqueueWebhook(
      {
        organizationId: job.organizationId,
        jobId: job.id,
        eventType: `job.${job.status}`,
        url: job.callbackUrl,
        data: { status: job.status, costMinor: job.costMinor, currency: job.costCurrency },
      },
      db,
    ).catch((error) => logger.error("Failed to enqueue webhook", { jobId: job.id, error }));
  }
  return job;
}

/**
 * LOCAL DEV ADAPTER: drain the in-memory queue, processing each job. Used by the
 * dev trigger endpoint when web + worker run in one process.
 */
export async function drainLocalQueue(db: Db = getDb()): Promise<number> {
  const queue = getJobQueue();
  let processed = 0;
  for (let message = await queue.dequeue(); message; message = await queue.dequeue()) {
    await processJobInDb(message.jobId, db);
    processed += 1;
  }
  return processed;
}

/**
 * Durable poll: claim up to `batchSize` queued jobs from Postgres (the system of
 * record) and process them. This is what the standalone worker (apps/worker)
 * runs in a loop — it depends only on the DB, not on any web/dashboard code.
 *
 * NOTE (documented in KNOWN_RISKS): single-worker safe. Running multiple worker
 * replicas requires `SELECT ... FOR UPDATE SKIP LOCKED` claiming to avoid two
 * workers grabbing the same job; processJob is idempotent on non-queued jobs,
 * which bounds (but does not fully eliminate) duplicate work under contention.
 */
export async function pollQueuedJobs(db: Db = getDb(), batchSize = 5): Promise<number> {
  const rows = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.status, "queued"))
    .orderBy(asc(schema.jobs.createdAt))
    .limit(batchSize);

  let processed = 0;
  for (const row of rows) {
    await processJobInDb(row.id, db);
    processed += 1;
  }
  return processed;
}

/**
 * Multi-worker safe claim + process. Atomically flips up to `batchSize` queued
 * jobs to `running` using `SELECT ... FOR UPDATE SKIP LOCKED`, so concurrent
 * worker replicas never claim the same job, then processes each as pre-claimed.
 */
export async function claimAndProcessJobs(db: Db = getDb(), batchSize = 5): Promise<number> {
  const claimed = await db.execute(sql`
    UPDATE jobs
    SET status = 'running', started_at = now(), attempt = attempt + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  const ids = (claimed as unknown as Array<{ id: string }>).map((r) => r.id);
  let processed = 0;
  for (const id of ids) {
    await processJobInDb(id, db, { preClaimed: true });
    processed += 1;
  }
  return processed;
}

/**
 * Reaper: fail jobs that have been `running` longer than `maxRunMs` (their
 * worker likely died), releasing any outstanding budget hold so reservations
 * are never stuck. Returns the number reaped.
 */
export async function reapExpiredJobs(db: Db = getDb(), maxRunMs = 120_000): Promise<number> {
  const cutoff = new Date(Date.now() - maxRunMs);
  const stuck = await db
    .select({
      id: schema.jobs.id,
      organizationId: schema.jobs.organizationId,
      costCurrency: schema.jobs.costCurrency,
    })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, "running"), lt(schema.jobs.startedAt, cutoff)));

  for (const job of stuck) {
    await db
      .update(schema.jobs)
      .set({
        status: "failed",
        error: { code: "LEASE_EXPIRED", message: "Worker lease expired; job reaped" },
        finishedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));
    await releaseBudget(
      { organizationId: job.organizationId, jobId: job.id, currency: job.costCurrency },
      db,
    ).catch(() => undefined);
    await writeAuditSystem(job.organizationId, {
      action: "job.failed",
      resourceType: "job",
      resourceId: job.id,
      after: { reason: "lease_expired" },
    }, db);
  }
  return stuck.length;
}
