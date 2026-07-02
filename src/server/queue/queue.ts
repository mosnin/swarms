/**
 * Process-wide queue accessor. Returns the configured {@link JobQueue} adapter.
 * Today this is the in-memory {@link LocalQueue}; swapping to a production broker
 * is a one-line change here and nowhere else, because callers depend only on the
 * {@link JobQueue} port.
 */

import { LocalQueue } from "@/server/queue/localQueue";
import type { JobQueue } from "@/server/queue/types";

let instance: JobQueue | undefined;

export function getJobQueue(): JobQueue {
  if (!instance) {
    // LOCAL DEV ADAPTER. Replace with the production broker adapter for deploy.
    instance = new LocalQueue();
  }
  return instance;
}

/** Test seam: override the queue (e.g. with a spy) and reset between tests. */
export function setJobQueue(queue: JobQueue | undefined): void {
  instance = queue;
}
