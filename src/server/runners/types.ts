/**
 * Runner abstraction. A runner executes a single skill version's logic for a
 * job and returns a structured result. Runners are the ONLY place capability
 * logic runs, and (crucially) they run in the worker — never inside a Next.js
 * request handler. The control plane composes runners via the registry; it
 * never executes arbitrary code itself.
 */

export type RunnerType = "agent" | "mock" | "http" | "local_worker";

export interface RunnerContext {
  jobId: string;
  organizationId: string;
  /** Validated job input. */
  input: unknown;
  /** Version-declared runner configuration (e.g. endpoint URL for http). */
  runnerConfig: unknown;
  /** Hard wall-clock limit; runners must abort beyond this. */
  maxRuntimeMs: number;
  /** Price of the capability in minor units (used as the charge on success). */
  priceMinor: number;
  currency: string;
}

export interface RunnerLog {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: unknown;
}

export type RunnerOutcome =
  | { ok: true; output: unknown; costMinor: number; logs: RunnerLog[] }
  | { ok: false; error: { code: string; message: string; details?: unknown }; logs: RunnerLog[] };

export interface Runner {
  readonly type: RunnerType;
  run(context: RunnerContext): Promise<RunnerOutcome>;
}
