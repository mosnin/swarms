/**
 * Job creation core. This module is storage-agnostic: it depends on a narrow
 * {@link JobStore} and {@link JobQueue} port so the full create-job invariant
 * set — input validation, idempotent replay, durable persistence, then enqueue —
 * can be unit-tested in memory and run against Postgres in production.
 *
 * Invariants enforced here:
 * - An agent spawn requires a non-empty task.
 * - (organizationId, idempotencyKey) is unique: replaying the same key with the
 *   same input returns the original job; a different input is a conflict.
 * - The job is durably persisted (status `queued`) BEFORE it is enqueued, so a
 *   crash after enqueue can never reference a non-existent job.
 * - The job is never executed inline in the request path.
 */

import { requestHash } from "@/lib/idempotency";
import { Errors } from "@/lib/errors";
import { newId, IdPrefix } from "@/lib/ids";
import { systemClock, type Clock } from "@/lib/time";
import type { JobMessage, JobQueue } from "@/server/queue/types";
import { getJobQueue } from "@/server/queue/queue";

/**
 * Default attempt budget for a job. >1 so a transient failure (or a worker
 * dying mid-run) requeues rather than permanently losing paid work. Terminal,
 * non-retryable failures (validation, policy, budget) stop after one attempt
 * regardless — the processor only requeues retryable error codes.
 */
const DEFAULT_MAX_ATTEMPTS = 3;

export type JobStatus =
  | "queued"
  | "running"
  | "awaiting_payment"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  "succeeded",
  "failed",
  "cancelled",
]);

export interface JobRecord {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  apiKeyId: string | null;
  capabilityKind: "agent" | "swarm" | "simulation" | "evaluation" | "connector";
  /** Agent task instruction (capabilityKind = "agent"). */
  task: string | null;
  /** Encrypted resource bundle handed to the spawned agent. */
  resourceBundleId: string | null;
  /** Model the spawned agent runs on. */
  model: string | null;
  idempotencyKey: string;
  inputHash: string;
  input: unknown;
  callbackUrl: string | null;
  output: unknown;
  error: unknown;
  status: JobStatus;
  /** Director-orchestrated (swarm child) job — skipped by the standalone poller. */
  orchestrated: boolean;
  priority: number;
  attempt: number;
  maxAttempts: number;
  costMinor: number;
  costCurrency: string;
  queuedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobLogRecord {
  id: string;
  organizationId: string;
  jobId: string;
  level: string;
  message: string;
  data: unknown;
  loggedAt: Date;
}

export interface JobStore {
  findByIdempotencyKey(organizationId: string, key: string): Promise<JobRecord | null>;
  insert(record: JobRecord): Promise<JobRecord>;
  findById(id: string): Promise<JobRecord | null>;
  update(id: string, patch: Partial<JobRecord>): Promise<JobRecord>;
  /**
   * Compare-and-swap update: apply `patch` only if the row is still in
   * `expectedStatus`. Returns the updated record, or `null` when the status no
   * longer matches — e.g. the job was cancelled or reaped while a worker ran it.
   * Terminal transitions use this so a cancelled job is never overwritten back
   * to succeeded (and never billed).
   */
  compareAndUpdate(
    id: string,
    expectedStatus: JobRecord["status"],
    patch: Partial<JobRecord>,
  ): Promise<JobRecord | null>;
  appendLog(record: JobLogRecord): Promise<JobLogRecord>;
  listLogs(jobId: string, organizationId?: string): Promise<JobLogRecord[]>;
}

/**
 * What the job will run. An `agent` job runs a sandboxed worker agent on a task
 * with an inherited resource bundle. Pricing is an up-front estimate (GPU/compute);
 * the worker records the actual metered cost.
 */
export interface ResolvedCapability {
  kind: "agent" | "swarm" | "simulation" | "evaluation";
  /** Agent task instruction or JSON-encoded swarm config (kind="swarm"). */
  task?: string | null;
  resourceBundleId?: string | null;
  model?: string | null;
  /** Estimated cost in minor units (GPU/compute estimate for agents). */
  priceMinor: number;
  priceCurrency: string;
}

export interface CreateJobInput {
  organizationId: string;
  createdByUserId: string | null;
  apiKeyId: string | null;
  capability: ResolvedCapability;
  input: unknown;
  idempotencyKey: string;
  /** Optional caller budget cap in minor units; must cover the estimated cost. */
  budgetMinor?: number;
  currency?: string;
  /** Optional webhook callback URL for job lifecycle events. */
  callbackUrl?: string | null;
  /**
   * When true, the job is created in `awaiting_approval` and NOT enqueued —
   * a human must approve it (policy `require_approval`). Defaults to false.
   */
  requireApproval?: boolean;
  /**
   * When false, the job row is persisted but NOT published to the queue. Used
   * by the swarm director, which runs its worker jobs in-process — enqueueing
   * them too would let another worker replica claim and double-execute them.
   * Defaults to true.
   */
  enqueue?: boolean;
  /**
   * Marks the job as director-orchestrated so the standalone DB poller skips it
   * (it runs in-process under its director, not the poller). Must be set for
   * swarm worker/aggregator jobs. Defaults to false. See jobs.orchestrated.
   */
  orchestrated?: boolean;
  /**
   * Override the attempt budget. Defaults to {@link DEFAULT_MAX_ATTEMPTS}. The
   * swarm director sets this to 1: a director retry cannot resume a partially
   * run fleet (it would no-op and falsely report success), so it must not retry.
   */
  maxAttempts?: number;
}

export interface CreateJobResult {
  job: JobRecord;
  /** True when an existing job was returned for a repeated idempotency key. */
  replay: boolean;
}

function messageFor(job: JobRecord): JobMessage {
  return {
    jobId: job.id,
    organizationId: job.organizationId,
    enqueuedAt: (job.queuedAt ?? job.createdAt).toISOString(),
  };
}

/**
 * Publish an already-persisted, non-gated job to the queue. Used by callers that
 * create the job with `enqueue: false` inside a transaction (so it isn't
 * claimable before its budget hold commits) and enqueue it only after commit.
 */
export async function publishJob(job: JobRecord, queue: JobQueue = getJobQueue()): Promise<void> {
  await queue.enqueue(messageFor(job));
}

/**
 * Create (or idempotently return) a job and enqueue it for asynchronous
 * execution. Never runs the job inline.
 */
export async function createJob(
  store: JobStore,
  queue: JobQueue,
  input: CreateJobInput,
  clock: Clock = systemClock,
): Promise<CreateJobResult> {
  const cap = input.capability;
  if (!cap.task || cap.task.trim().length === 0) {
    throw Errors.validation("A job spawn requires a non-empty task");
  }

  const inputHash = requestHash({
    kind: cap.kind,
    task: cap.task ?? null,
    input: input.input,
  });

  // Idempotent replay: same key returns the prior job; different input conflicts.
  const existing = await store.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
  if (existing) {
    if (existing.inputHash !== inputHash) {
      throw Errors.idempotencyConflict(
        "Idempotency key was already used with a different request",
      );
    }
    return { job: existing, replay: true };
  }

  const estimatedCostMinor = cap.priceMinor;
  const currency = input.currency ?? cap.priceCurrency;

  if (input.budgetMinor !== undefined) {
    if (!Number.isInteger(input.budgetMinor) || input.budgetMinor < 0) {
      throw Errors.validation("budgetMinor must be a non-negative integer (minor units)");
    }
    if (input.budgetMinor < estimatedCostMinor) {
      throw Errors.budgetExceeded("budgetMinor is below the estimated cost", {
        budgetMinor: input.budgetMinor,
        estimatedCostMinor,
      });
    }
  }

  const now = clock.now();
  const gated = input.requireApproval === true;
  const record: JobRecord = {
    id: newId(IdPrefix.job),
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId,
    apiKeyId: input.apiKeyId,
    capabilityKind: cap.kind,
    task: cap.task ?? null,
    resourceBundleId: cap.resourceBundleId ?? null,
    model: cap.model ?? null,
    idempotencyKey: input.idempotencyKey,
    inputHash,
    input: input.input,
    callbackUrl: input.callbackUrl ?? null,
    output: null,
    error: null,
    status: gated ? "awaiting_approval" : "queued",
    orchestrated: input.orchestrated ?? false,
    priority: 0,
    attempt: 0,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    costMinor: 0,
    costCurrency: currency,
    queuedAt: gated ? null : now,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  // Persist BEFORE enqueue: the durable row is the source of truth. A gated job
  // is persisted but never enqueued until it is approved.
  const job = await store.insert(record);
  await store.appendLog({
    id: newId(IdPrefix.executionLog),
    organizationId: job.organizationId,
    jobId: job.id,
    level: "info",
    message: gated ? "Agent spawn awaiting approval" : "Agent spawned and queued",
    data: { capabilityKind: job.capabilityKind, estimatedCostMinor },
    loggedAt: now,
  });
  // Enqueue unless gated (awaiting approval) or the caller runs it in-process
  // (director-spawned worker jobs — see CreateJobInput.enqueue).
  if (!gated && input.enqueue !== false) await queue.enqueue(messageFor(job));

  return { job, replay: false };
}

/** Approve a job awaiting approval: transition to queued and enqueue it. */
export async function approveJob(
  store: JobStore,
  queue: JobQueue,
  jobId: string,
  clock: Clock = systemClock,
): Promise<JobRecord> {
  const job = await store.findById(jobId);
  if (!job) throw Errors.notFound("Job not found");
  if (job.status !== "awaiting_approval") {
    throw Errors.conflict(`Job is ${job.status}, not awaiting approval`);
  }
  const now = clock.now();
  await store.appendLog({
    id: newId(IdPrefix.executionLog),
    organizationId: job.organizationId,
    jobId,
    level: "info",
    message: "Job approved and queued",
    data: null,
    loggedAt: now,
  });
  const queued = await store.update(jobId, { status: "queued", queuedAt: now, updatedAt: now });
  await queue.enqueue(messageFor(queued));
  return queued;
}

/** Cancel a non-terminal job and release its place in the lifecycle. */
export async function cancelJob(
  store: JobStore,
  jobId: string,
  clock: Clock = systemClock,
): Promise<JobRecord> {
  const job = await store.findById(jobId);
  if (!job) throw Errors.notFound("Job not found");
  if (TERMINAL_STATUSES.has(job.status)) {
    throw Errors.conflict(`Job is already ${job.status} and cannot be cancelled`);
  }
  const now = clock.now();
  // Compare-and-swap from the observed non-terminal state: a worker's CAS
  // running→succeeded (which also commits the charge) can land between the read
  // above and this write. A plain update would overwrite that terminal state,
  // billing a job whose status then reads "cancelled". If the CAS misses, the job
  // reached a terminal state concurrently — surface a conflict, don't clobber it.
  const cancelled = await store.compareAndUpdate(jobId, job.status, {
    status: "cancelled",
    finishedAt: now,
    updatedAt: now,
  });
  if (!cancelled) {
    const current = await store.findById(jobId);
    throw Errors.conflict(`Job is already ${current?.status ?? "terminal"} and cannot be cancelled`);
  }
  await store.appendLog({
    id: newId(IdPrefix.executionLog),
    organizationId: job.organizationId,
    jobId,
    level: "info",
    message: "Job cancelled",
    data: { previousStatus: job.status },
    loggedAt: now,
  });
  return cancelled;
}
