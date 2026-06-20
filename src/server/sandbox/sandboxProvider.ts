/**
 * Sandbox provider selection. There is no production-safe provider in this repo,
 * so the selector **fails closed**: it returns the dev stub only outside
 * production and only when explicitly enabled, and otherwise throws. No
 * production code path may obtain a sandbox that runs untrusted code.
 */

import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { LocalStubSandboxProvider } from "@/server/sandbox/localStubSandboxProvider";
import type { SandboxProvider } from "@/server/sandbox/types";

let provider: SandboxProvider | undefined;

export function getSandboxProvider(): SandboxProvider {
  if (provider) return provider;

  if (env.NODE_ENV === "production") {
    // No real sandbox exists yet; refuse rather than silently using the stub.
    throw Errors.config(
      "No production-safe sandbox provider is configured. Untrusted code execution is disabled.",
    );
  }
  if (!env.ENABLE_LOCAL_WORKER_RUNNER) {
    throw Errors.config(
      "Sandbox is disabled. The local stub is dev-only and must be explicitly enabled.",
    );
  }
  provider = new LocalStubSandboxProvider();
  return provider;
}

/** Whether any sandbox usable for untrusted code is available (always false today). */
export function hasProductionSandbox(): boolean {
  return false;
}

/** Test seam. */
export function setSandboxProvider(p: SandboxProvider | undefined): void {
  provider = p;
}
