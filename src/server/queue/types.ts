/**
 * Job queue abstraction. The control plane (Next.js) only ever *enqueues* work;
 * execution happens in a separate worker (see Phase 7 / `apps/worker`). The
 * durable system of record is always Postgres — a queued job is a row with
 * `status = 'queued'`. The queue is a delivery/signal mechanism and must be
 * treated as reconstructable from the database.
 */

export interface JobMessage {
  jobId: string;
  organizationId: string;
  /** ISO-8601 enqueue timestamp. */
  enqueuedAt: string;
}

export type JobHandler = (message: JobMessage) => Promise<void>;

export interface JobQueue {
  /** Publish a job for processing. Idempotent at the queue level is NOT assumed;
   * idempotency is enforced upstream by the unique (org, idempotencyKey). */
  enqueue(message: JobMessage): Promise<void>;
  /** Claim the next available message, or `null` when the queue is empty. */
  dequeue(): Promise<JobMessage | null>;
  /** Number of messages currently waiting (best-effort; local adapters only). */
  size(): number;
}
