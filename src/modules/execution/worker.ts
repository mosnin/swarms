/**
 * Worker-side wiring: composes the storage-agnostic {@link processJob} core with
 * Postgres-backed stores, capability resolution, and the append-only usage
 * ledger. Exposes a single-job processor and a local queue drain used in
 * development to run the full execution loop without a separate worker process
 * (the standalone worker in Phase 16 reuses the same core).
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { isRunnerType } from "@/server/runners/runnerRegistry";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";
import { writeAuditSystem } from "@/modules/governance/audit";
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
      // Append-only usage charge for the executed capability.
      await appendEntry(dbLedgerStore(db), {
        organizationId: job.organizationId,
        jobId: job.id,
        direction: "debit",
        kind: "charge",
        amountMinor: costMinor,
        currency,
        description: "Capability execution charge",
        refType: "job",
        refId: job.id,
      });
      await writeAuditSystem(job.organizationId, {
        action: "job.succeeded",
        resourceType: "job",
        resourceId: job.id,
        after: { costMinor, currency },
      });
    },
  };
}

const WORKER_ID = `inproc-${process.pid}`;

/** Process a single job by id using Postgres-backed stores. */
export async function processJobInDb(jobId: string, db: Db = getDb()): Promise<JobRecord> {
  return processJob(deps(db, WORKER_ID), jobId);
}

/**
 * LOCAL DEV ADAPTER: drain the in-memory queue, processing each job. The
 * standalone worker (Phase 16) replaces this with a durable poll loop.
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
