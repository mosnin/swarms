/**
 * Job creation core. This module is storage-agnostic: it depends on a narrow
 * {@link JobStore} and {@link JobQueue} port so the full create-job invariant
 * set — input validation, idempotent replay, durable persistence, then enqueue —
 * can be unit-tested in memory and run against Postgres in production.
 *
 * Invariants enforced here:
 * - Input is validated against the skill version's input schema.
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
import { assertValidInput } from "@/modules/execution/input-validation";
import type { JobMessage, JobQueue } from "@/server/queue/types";

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
  capabilityKind: "skill" | "swarm" | "connector";
  skillVersionId: string | null;
  idempotencyKey: string;
  inputHash: string;
  input: unknown;
  output: unknown;
  error: unknown;
  status: JobStatus;
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
  appendLog(record: JobLogRecord): Promise<JobLogRecord>;
  listLogs(jobId: string): Promise<JobLogRecord[]>;
}

/** Minimal capability descriptor the core needs to create + price a job. */
export interface ResolvedSkillVersion {
  id: string;
  skillId: string;
  status: "draft" | "published" | "deprecated" | "yanked";
  inputSchema: unknown;
  priceMinor: number;
  priceCurrency: string;
}

export interface CreateJobInput {
  organizationId: string;
  createdByUserId: string | null;
  apiKeyId: string | null;
  skillVersion: ResolvedSkillVersion;
  input: unknown;
  idempotencyKey: string;
  /** Optional caller budget cap in minor units; must cover the estimated cost. */
  budgetMinor?: number;
  currency?: string;
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
 * Create (or idempotently return) a job and enqueue it for asynchronous
 * execution. Never runs the job inline.
 */
export async function createJob(
  store: JobStore,
  queue: JobQueue,
  input: CreateJobInput,
  clock: Clock = systemClock,
): Promise<CreateJobResult> {
  // A published version is required to execute.
  if (input.skillVersion.status !== "published") {
    throw Errors.capabilityNotFound("Skill version is not published");
  }

  assertValidInput(input.input, input.skillVersion.inputSchema);

  const inputHash = requestHash({
    skillVersionId: input.skillVersion.id,
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

  const estimatedCostMinor = input.skillVersion.priceMinor;
  const currency = input.currency ?? input.skillVersion.priceCurrency;

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
  const record: JobRecord = {
    id: newId(IdPrefix.job),
    organizationId: input.organizationId,
    createdByUserId: input.createdByUserId,
    apiKeyId: input.apiKeyId,
    capabilityKind: "skill",
    skillVersionId: input.skillVersion.id,
    idempotencyKey: input.idempotencyKey,
    inputHash,
    input: input.input,
    output: null,
    error: null,
    status: "queued",
    priority: 0,
    attempt: 0,
    maxAttempts: 1,
    costMinor: 0,
    costCurrency: currency,
    queuedAt: now,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  // Persist BEFORE enqueue: the durable row is the source of truth.
  const job = await store.insert(record);
  await store.appendLog({
    id: newId(IdPrefix.executionLog),
    organizationId: job.organizationId,
    jobId: job.id,
    level: "info",
    message: "Job created and queued",
    data: { skillVersionId: job.skillVersionId, estimatedCostMinor },
    loggedAt: now,
  });
  await queue.enqueue(messageFor(job));

  return { job, replay: false };
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
  await store.appendLog({
    id: newId(IdPrefix.executionLog),
    organizationId: job.organizationId,
    jobId,
    level: "info",
    message: "Job cancelled",
    data: { previousStatus: job.status },
    loggedAt: now,
  });
  return store.update(jobId, { status: "cancelled", finishedAt: now, updatedAt: now });
}
