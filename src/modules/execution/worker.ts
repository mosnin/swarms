/**
 * Worker-side wiring: composes the storage-agnostic {@link processJob} core with
 * Postgres-backed stores, capability resolution, and the append-only usage
 * ledger. Exposes a single-job processor and a local queue drain used in
 * development to run the full execution loop without a separate worker process
 * (the standalone worker in Phase 16 reuses the same core).
 */

import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { commitBudget } from "@/server/budget/commitBudget";
import { checkCostAnomaly } from "@/server/billing/costAnomaly";
import type { DirectorSwarmConfig } from "@/server/runners/swarmRunner";
import type { DirectorSimulationConfig } from "@/server/runners/simulationRunner";
import { releaseBudget } from "@/server/budget/releaseBudget";
import { logger } from "@/lib/logger";
import { metrics } from "@/lib/metrics";
import { writeAuditSystem } from "@/modules/governance/audit";
import { enqueueWebhook } from "@/modules/webhooks/webhook-service";
import { openResourceBundle } from "@/modules/resources/resource-bundle";
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
  // Agent labor: open the inherited resource bundle and run the agent runtime,
  // hard-capped at the budgeted GPU seconds.
  if (job.capabilityKind === "agent") {
    const input = (job.input ?? {}) as {
      maxGpuSeconds?: number;
      rateMinorPerSecond?: number;
      currency?: string;
    };
    // Clamp to non-negative integers: cost is money in minor units, so a
    // negative or fractional rate/seconds must never reach the ledger.
    const maxGpuSeconds = Math.max(
      0,
      Math.floor(typeof input.maxGpuSeconds === "number" ? input.maxGpuSeconds : 60),
    );
    const rate = Math.max(
      0,
      Math.floor(typeof input.rateMinorPerSecond === "number" ? input.rateMinorPerSecond : 2),
    );
    const resources = job.resourceBundleId
      ? await openResourceBundle(job.organizationId, job.resourceBundleId, db).catch(() => ({}))
      : {};
    return {
      runnerType: "agent",
      runnerConfig: {
        task: job.task ?? "",
        model: job.model ?? "deepseek/deepseek-chat-v4",
        resources,
        maxGpuSeconds,
        rateMinorPerSecond: rate,
      },
      maxRuntimeMs: Math.min(600_000, maxGpuSeconds * 1000 + 5_000),
      priceMinor: maxGpuSeconds * rate,
      currency: job.costCurrency || input.currency || "USD",
    };
  }

  // Hierarchical director: the job holds a JSON swarm config in `task`; the
  // SwarmRunner spawns a child swarm and returns its aggregated result.
  if (job.capabilityKind === "swarm") {
    const input = (job.input ?? {}) as Partial<DirectorSwarmConfig>;
    const currency = job.costCurrency || input.currency || "USD";
    const config: DirectorSwarmConfig = {
      tasks: input.tasks ?? [],
      objective: input.objective,
      model: input.model ?? job.model ?? undefined,
      budgetMinor: input.budgetMinor ?? (job.costMinor > 0 ? job.costMinor : undefined),
      currency,
      aggregatorTask: input.aggregatorTask,
      sequential: input.sequential,
      workerTimeouts: input.workerTimeouts,
      deduplicateStrict: input.deduplicateStrict,
      callbackUrl: input.callbackUrl,
      apiKeyId: job.apiKeyId,
      createdByUserId: job.createdByUserId,
      // Child swarm idempotency: bind to the pre-created run when present so a
      // director retry re-executes into the same run rather than forking a new one.
      idempotencyKey: input.existingRunId ? `swarm-run-${input.existingRunId}` : `director-${job.id}`,
      existingRunId: input.existingRunId,
      resourceBundleId: input.resourceBundleId,
    };
    return {
      runnerType: "swarm",
      runnerConfig: config,
      maxRuntimeMs: 600_000,
      priceMinor: job.costMinor,
      currency,
    };
  }

  // Simulation director: a NORMAL poller-claimed, charged job (unlike the swarm
  // director). The SimulationRunner runs the whole crew in one sandbox and
  // returns the single charge (base*agents + gpu*rate). The runnerConfig is the
  // DirectorSimulationConfig stored verbatim in the job input at enqueue time.
  if (job.capabilityKind === "simulation") {
    const config = (job.input ?? {}) as Partial<DirectorSimulationConfig>;
    const currency = job.costCurrency || config.currency || "USD";
    return {
      runnerType: "simulation",
      runnerConfig: {
        ...config,
        // The originating principal comes from the job row, not the stored input.
        apiKeyId: job.apiKeyId,
        createdByUserId: job.createdByUserId,
        currency,
      },
      // The crew shares one sandbox and may run many rounds — give it the full
      // ceiling (same as the swarm director), bounded by GPU seconds via cost.
      maxRuntimeMs: 600_000,
      priceMinor: job.costMinor,
      currency,
    };
  }

  // Only agent, swarm, and simulation capabilities are executable; any other
  // kind is unsupported.
  return null;
}

function deps(db: Db, workerId: string): ProcessDeps {
  return {
    jobStore: dbJobStore(db),
    workerRunStore: dbWorkerRunStore(db),
    resolve: (job) => resolveExecution(db, job),
    workerId,
    async onCharge(job, costMinor, currency) {
      // A swarm DIRECTOR job coordinates only: every worker (and the aggregator)
      // is its own job and is charged + budget-checked individually inside the
      // child run. The director's reported cost is the SUM of those children, so
      // charging it here would double-bill the org for work already paid for —
      // and it carries no reservation hold. Record the aggregate for display /
      // audit, but never write a second ledger charge for it.
      if (job.capabilityKind === "swarm") {
        await writeAuditSystem(job.organizationId, {
          action: "job.succeeded",
          resourceType: "job",
          resourceId: job.id,
          after: { costMinor, currency, note: "swarm-director-aggregate (children charged individually)" },
        }, db);
        return;
      }
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
      // Flag a charge far above the org's recent average (best-effort).
      await checkCostAnomaly(job, costMinor, db).catch(() => undefined);
    },
    async onReleaseHold(job, currency) {
      // Fallback: commitBudget failed after job was marked succeeded. Release
      // the hold so budget headroom is not permanently frozen.
      await releaseBudget(
        { organizationId: job.organizationId, jobId: job.id, currency },
        db,
      );
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
  if (job.status === "succeeded" || job.status === "failed") {
    metrics().increment("jobs.processed", 1, { status: job.status });
  }
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
 * @deprecated Use {@link claimAndProcessJobs}. This non-atomic select-then-process
 * poll was multi-worker-unsafe (two replicas could claim the same queued job and
 * double-execute its side effects). It now delegates to the atomic
 * `FOR UPDATE SKIP LOCKED` claim so the footgun cannot fire; the export is kept
 * only for backward compatibility.
 */
export async function pollQueuedJobs(db: Db = getDb(), batchSize = 5): Promise<number> {
  return claimAndProcessJobs(db, batchSize);
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
      WHERE status = 'queued' AND orchestrated = false
      ORDER BY created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  // Normalize across drivers: postgres-js returns an array; pglite returns { rows }.
  const claimedRows = (
    Array.isArray(claimed) ? claimed : (claimed as { rows?: unknown[] }).rows ?? []
  ) as Array<{ id: string }>;
  const ids = claimedRows.map((r) => r.id);
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
// Default lease horizon exceeds the maximum permitted job runtime (600s, see
// resolveExecution) plus a margin, so a legitimately long-running job on a live
// worker is never reaped mid-flight.
export async function reapExpiredJobs(
  db: Db = getDb(),
  maxRunMs = 660_000,
  // A swarm director orchestrates up to 16 sequential sub-jobs (each ~600s), so
  // it legitimately runs far longer than a single agent job. Give it a much
  // larger lease so a healthy long director isn't falsely reaped mid-fleet.
  swarmMaxRunMs = 16 * 660_000,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxRunMs);
  const swarmCutoff = new Date(Date.now() - swarmMaxRunMs);
  const stuck = await db
    .select({
      id: schema.jobs.id,
      organizationId: schema.jobs.organizationId,
      costCurrency: schema.jobs.costCurrency,
      attempt: schema.jobs.attempt,
      maxAttempts: schema.jobs.maxAttempts,
      capabilityKind: schema.jobs.capabilityKind,
      orchestrated: schema.jobs.orchestrated,
      startedAt: schema.jobs.startedAt,
    })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, "running"), lt(schema.jobs.startedAt, cutoff)));

  let reaped = 0;
  for (const job of stuck) {
    // Swarm directors get the larger lease — skip ones that haven't exceeded it.
    if (job.capabilityKind === "swarm" && job.startedAt && job.startedAt >= swarmCutoff) {
      continue;
    }
    // A dead worker's lease expiry is transient: if attempts remain, requeue the
    // job (keeping its budget hold) rather than permanently failing paid work.
    // Orchestrated (swarm) jobs are the exception: the poller cannot re-run them
    // (it filters them out), so requeuing would strand them — fail them and let
    // the swarm-run reaper settle the run and release holds.
    const willRetry = job.attempt < job.maxAttempts && !job.orchestrated;

    // Guard the transition: only act on a job that is STILL running. A job that
    // finished between the select and this update must not be flipped from
    // succeeded/failed and its budget must not be re-released.
    const updated = await db
      .update(schema.jobs)
      .set(
        willRetry
          ? { status: "queued", startedAt: null, updatedAt: new Date() }
          : {
              status: "failed",
              error: { code: "LEASE_EXPIRED", message: "Worker lease expired; job reaped" },
              finishedAt: new Date(),
            },
      )
      .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.status, "running")))
      .returning({ id: schema.jobs.id });
    if (updated.length === 0) continue; // finished concurrently — leave it alone

    reaped += 1;
    if (willRetry) {
      await writeAuditSystem(job.organizationId, {
        action: "job.requeued",
        resourceType: "job",
        resourceId: job.id,
        after: { reason: "lease_expired", attempt: job.attempt, maxAttempts: job.maxAttempts },
      }, db);
      continue; // keep the hold; the job will be re-claimed
    }
    // Attempts exhausted — release the hold and record the terminal failure.
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
  return reaped;
}

/**
 * Swarm-run reaper: recover swarm runs orphaned by a dead director. A director
 * that dies mid-fleet is failed by {@link reapExpiredJobs} (maxAttempts=1, so it
 * is failed rather than requeued), but that leaves the swarm_runs row stuck
 * non-terminal forever with worker holds outstanding. This finds runs whose
 * director job has reached a terminal FAILURE while the run is still
 * running/queued, settles the run to `failed`, and releases outstanding worker
 * holds. Keyed off the director's terminal state (not a time guess), so a live
 * long-running director is never touched.
 */
export async function reapOrphanedSwarmRuns(db: Db = getDb()): Promise<number> {
  const openRuns = await db
    .select({
      id: schema.swarmRuns.id,
      organizationId: schema.swarmRuns.organizationId,
      costCurrency: schema.swarmRuns.costCurrency,
    })
    .from(schema.swarmRuns)
    .where(inArray(schema.swarmRuns.status, ["running", "queued"]));

  let reaped = 0;
  for (const run of openRuns) {
    const director = (
      await db
        .select({ status: schema.jobs.status })
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.organizationId, run.organizationId),
            eq(schema.jobs.idempotencyKey, `swarm-director-${run.id}`),
          ),
        )
        .limit(1)
    )[0];

    // Only reap when the director has terminally FAILED. If it's still
    // running/queued the fleet may be live; if it succeeded the run was settled.
    if (!director || (director.status !== "failed" && director.status !== "cancelled")) {
      continue;
    }

    const updated = await db
      .update(schema.swarmRuns)
      .set({
        status: "failed",
        output: { error: "director_orphaned", reason: "director job failed before the swarm settled" },
        finishedAt: new Date(),
      })
      .where(and(eq(schema.swarmRuns.id, run.id), inArray(schema.swarmRuns.status, ["running", "queued"])))
      .returning({ id: schema.swarmRuns.id });
    if (updated.length === 0) continue; // settled concurrently

    reaped += 1;
    // Release outstanding holds for any worker jobs of this run.
    const agents = await db
      .select({ jobId: schema.swarmAgents.jobId })
      .from(schema.swarmAgents)
      .where(eq(schema.swarmAgents.swarmRunId, run.id));
    for (const agent of agents) {
      if (agent.jobId) {
        await releaseBudget(
          { organizationId: run.organizationId, jobId: agent.jobId, currency: run.costCurrency },
          db,
        ).catch(() => undefined);
      }
    }
    await writeAuditSystem(run.organizationId, {
      action: "swarm_run.failed",
      resourceType: "swarm_run",
      resourceId: run.id,
      after: { reason: "director_orphaned" },
    }, db);
  }
  return reaped;
}
