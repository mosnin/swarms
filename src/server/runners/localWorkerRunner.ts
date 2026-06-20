/**
 * LOCAL DEV ADAPTER — local worker runner stub.
 *
 * This is a PLACEHOLDER for running a skill's own code locally. It is DISABLED
 * by default and must be explicitly enabled via `ENABLE_LOCAL_WORKER_RUNNER`.
 * It deliberately does NOT execute arbitrary code: a real implementation
 * requires a hardened sandbox (see Phase 17 / docs/SANDBOX_RUNTIME.md). Until
 * that exists, this runner refuses to run and returns a structured error so no
 * untrusted code path can be reached by accident.
 */

import { env } from "@/lib/env";
import type { Runner, RunnerContext, RunnerOutcome } from "@/server/runners/types";

export class LocalWorkerRunner implements Runner {
  readonly type = "local_worker" as const;

  async run(_context: RunnerContext): Promise<RunnerOutcome> {
    if (!env.ENABLE_LOCAL_WORKER_RUNNER) {
      return {
        ok: false,
        error: {
          code: "SANDBOX_FAILURE",
          message:
            "local_worker runner is disabled. It requires a hardened sandbox before executing skill code.",
        },
        logs: [{ level: "warn", message: "local_worker runner invoked while disabled" }],
      };
    }

    // Even when enabled, refuse until a real sandbox provider is wired in. The
    // local stub must never claim to be a secure execution environment.
    return {
      ok: false,
      error: {
        code: "SANDBOX_FAILURE",
        message: "No secure sandbox provider configured for local_worker execution.",
      },
      logs: [{ level: "warn", message: "local_worker runner has no sandbox provider" }],
    };
  }
}
