/**
 * Job processor. This is the worker-side execution path: claim a queued job,
 * transition it through the state machine, invoke the appropriate runner, record
 * the worker run + execution logs + cost, and settle the job (succeeded/failed).
 *
 * It depends only on ports + the runner registry, so the entire loop can be
 * unit-tested in memory (mock runner) and run against Postgres in the worker.
 * NOTE: this never runs inside a Next.js request handler — it is invoked by the
 * worker process / a queue consumer.
 */

import { newId, IdPrefix } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { systemClock, type Clock } from "@/lib/time";
import type { JobRecord, JobStore } from "@/modules/execution/job-service";
import { assertTransition } from "@/server/jobs/stateMachine";
import { getRunner } from "@/server/runners/runnerRegistry";
import type { RunnerType } from "@/server/runners/types";

export interface WorkerRunRecord {
  id: string;
  organizationId: string;
  jobId: string;
  skillVersionId: string | null;
  workerId: string;
  runnerType: string | null;
  status: JobRecord["status"];
  input: unknown;
  output: unknown;
  error: unknown;
  durationMs: number | null;
  costMinor: number;
  costCurrency: string;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface WorkerRunStore {
  insert(record: WorkerRunRecord): Promise<WorkerRunRecord>;
  update(id: string, patch: Partial<WorkerRunRecord>): Promise<WorkerRunRecord>;
}

/** Execution parameters resolved from the pinned skill version. */
export interface ResolvedExecution {
  runnerType: RunnerType;
  runnerConfig: unknown;
  maxRuntimeMs: number;
  priceMinor: number;
  currency: string;
}

export interface ProcessDeps {
  jobStore: JobStore;
  workerRunStore: WorkerRunStore;
  /** Resolve the execution config for a job's pinned skill version. */
  resolve(job: JobRecord): Promise<ResolvedExecution | null>;
  /** Record a usage charge on success (append-only ledger). Optional. */
  onCharge?(job: JobRecord, costMinor: number, currency: string): Promise<void>;
  workerId: string;
  clock?: Clock;
}

const DEFAULT_MAX_RUNTIME_MS = 30_000;

/**
 * Process a single job. Safe to call on a job that is no longer `queued`
 * (returns it unchanged) so redelivery cannot double-execute.
 *
 * `opts.preClaimed` is set by a multi-worker poller that has ALREADY atomically
 * claimed the job (`queued → running` via `SELECT ... FOR UPDATE SKIP LOCKED`),
 * so this function must not re-transition it.
 */
export async function processJob(
  deps: ProcessDeps,
  jobId: string,
  opts: { preClaimed?: boolean } = {},
): Promise<JobRecord> {
  const clock = deps.clock ?? systemClock;
  const job = await deps.jobStore.findById(jobId);
  if (!job) {
    logger.warn("processJob: job not found", { jobId });
    throw new Error(`Job ${jobId} not found`);
  }
  // Idempotent: only an eligible job runs. A pre-claimed job is already
  // `running`; an unclaimed job must still be `queued`.
  if (opts.preClaimed) {
    if (job.status !== "running") return job;
  } else if (job.status !== "queued") {
    return job;
  }

  const resolved = await deps.resolve(job);
  if (!resolved) {
    return settleFailure(deps, job, clock, {
      code: "CAPABILITY_NOT_FOUND",
      message: "Could not resolve execution config for job",
    });
  }

  const startedAt = job.startedAt ?? clock.now();
  const startMono = clock.monotonicMs();
  // queued → running (skipped when the poller already claimed it).
  let running = job;
  if (!opts.preClaimed) {
    assertTransition(job.status, "running");
    running = await deps.jobStore.update(job.id, {
      status: "running",
      startedAt,
      attempt: job.attempt + 1,
      updatedAt: startedAt,
    });
  }

  const workerRun = await deps.workerRunStore.insert({
    id: newId(IdPrefix.workerRun),
    organizationId: job.organizationId,
    jobId: job.id,
    skillVersionId: job.skillVersionId,
    workerId: deps.workerId,
    runnerType: resolved.runnerType,
    status: "running",
    input: job.input,
    output: null,
    error: null,
    durationMs: null,
    costMinor: 0,
    costCurrency: resolved.currency,
    startedAt,
    finishedAt: null,
  });

  await deps.jobStore.appendLog({
    id: newId(IdPrefix.executionLog),
    organizationId: job.organizationId,
    jobId: job.id,
    level: "info",
    message: `Worker ${deps.workerId} started ${resolved.runnerType} runner`,
    data: { workerRunId: workerRun.id },
    loggedAt: startedAt,
  });

  let outcome;
  try {
    outcome = await getRunner(resolved.runnerType).run({
      jobId: job.id,
      organizationId: job.organizationId,
      skillVersionId: job.skillVersionId ?? "",
      input: job.input,
      runnerConfig: resolved.runnerConfig,
      maxRuntimeMs: resolved.maxRuntimeMs || DEFAULT_MAX_RUNTIME_MS,
      priceMinor: resolved.priceMinor,
      currency: resolved.currency,
    });
  } catch (error) {
    outcome = {
      ok: false as const,
      error: { code: "SANDBOX_FAILURE", message: "Runner threw unexpectedly" },
      logs: [{ level: "error" as const, message: "Runner threw", data: String(error) }],
    };
  }

  const finishedAt = clock.now();
  const durationMs = Math.max(0, Math.round(clock.monotonicMs() - startMono));

  // Persist runner logs as execution logs.
  for (const log of outcome.logs) {
    await deps.jobStore.appendLog({
      id: newId(IdPrefix.executionLog),
      organizationId: job.organizationId,
      jobId: job.id,
      level: log.level,
      message: log.message,
      data: { ...(log.data !== undefined ? { detail: log.data } : {}), workerRunId: workerRun.id },
      loggedAt: finishedAt,
    });
  }

  if (outcome.ok) {
    assertTransition(running.status, "succeeded");
    await deps.workerRunStore.update(workerRun.id, {
      status: "succeeded",
      output: outcome.output,
      durationMs,
      costMinor: outcome.costMinor,
      finishedAt,
    });
    const settled = await deps.jobStore.update(job.id, {
      status: "succeeded",
      output: outcome.output,
      costMinor: outcome.costMinor,
      costCurrency: resolved.currency,
      finishedAt,
      updatedAt: finishedAt,
    });
    if (deps.onCharge && outcome.costMinor > 0) {
      await deps.onCharge(settled, outcome.costMinor, resolved.currency);
    }
    return settled;
  }

  return settleFailure(deps, running, clock, outcome.error, workerRun.id, durationMs);
}

async function settleFailure(
  deps: ProcessDeps,
  job: JobRecord,
  clock: Clock,
  error: { code: string; message: string; details?: unknown },
  workerRunId?: string,
  durationMs?: number,
): Promise<JobRecord> {
  const finishedAt = clock.now();
  if (workerRunId) {
    await deps.workerRunStore.update(workerRunId, {
      status: "failed",
      error,
      durationMs: durationMs ?? null,
      finishedAt,
    });
  }
  await deps.jobStore.appendLog({
    id: newId(IdPrefix.executionLog),
    organizationId: job.organizationId,
    jobId: job.id,
    level: "error",
    message: `Job failed: ${error.message}`,
    data: { code: error.code },
    loggedAt: finishedAt,
  });
  // running → failed (or queued → failed when resolution failed pre-run).
  assertTransition(job.status, "failed");
  return deps.jobStore.update(job.id, {
    status: "failed",
    error,
    finishedAt,
    updatedAt: finishedAt,
  });
}
