/**
 * Job lifecycle state machine. All status transitions in the platform must go
 * through {@link assertTransition} so illegal jumps (e.g. succeeded → running)
 * are impossible. The transition table is the single source of truth and is
 * exhaustively unit-tested.
 */

import { Errors } from "@/lib/errors";
import type { JobStatus } from "@/modules/execution/job-service";

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running", "awaiting_payment", "awaiting_approval", "failed", "cancelled"],
  // running → queued is a retry requeue after a transient failure (bounded by
  // maxAttempts); the job keeps its budget hold across the retry.
  running: ["succeeded", "failed", "queued", "awaiting_approval", "cancelled"],
  awaiting_approval: ["queued", "cancelled"],
  awaiting_payment: ["queued", "cancelled"],
  // Terminal states.
  succeeded: [],
  failed: [],
  cancelled: [],
};

export const TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>([
  "succeeded",
  "failed",
  "cancelled",
]);

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

/** Whether `from → to` is a permitted transition. */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Assert a transition is legal; throws `CONFLICT` otherwise. */
export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw Errors.conflict(`Illegal job transition: ${from} → ${to}`, { from, to });
  }
}

export function nextStates(from: JobStatus): readonly JobStatus[] {
  return TRANSITIONS[from];
}
