/**
 * LOCAL DEV ADAPTER: an in-process FIFO job queue. Suitable only for local
 * development and tests — messages live in memory and are lost on restart. In
 * production this is replaced by an external broker (e.g. SQS/Redis) or the
 * Postgres `SKIP LOCKED` poller used by the standalone worker. The job row in
 * Postgres remains the durable source of truth regardless of adapter.
 */

import { logger } from "@/lib/logger";
import type { JobMessage, JobQueue } from "@/server/queue/types";

export class LocalQueue implements JobQueue {
  private readonly messages: JobMessage[] = [];

  async enqueue(message: JobMessage): Promise<void> {
    this.messages.push(message);
    logger.info("Job enqueued", { jobId: message.jobId, queueDepth: this.messages.length });
  }

  async dequeue(): Promise<JobMessage | null> {
    return this.messages.shift() ?? null;
  }

  size(): number {
    return this.messages.length;
  }
}
