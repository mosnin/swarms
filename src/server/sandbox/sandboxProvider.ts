/**
 * Sandbox provider selection. There is no production-safe provider in this repo,
 * so the selector **fails closed**: it returns the dev stub only outside
 * production and only when explicitly enabled, and otherwise throws. No
 * production code path may obtain a sandbox that runs untrusted code.
 */

import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { DockerSandboxProvider } from "@/server/sandbox/dockerSandboxProvider";
import { LocalStubSandboxProvider } from "@/server/sandbox/localStubSandboxProvider";
import type { SandboxProvider } from "@/server/sandbox/types";

let provider: SandboxProvider | undefined;

export function getSandboxProvider(): SandboxProvider {
  if (provider) return provider;

  // A real container provider when configured (production-safe boundary).
  if (env.SANDBOX_PROVIDER === "docker" || env.SANDBOX_PROVIDER === "podman") {
    provider = new DockerSandboxProvider({ image: env.SANDBOX_IMAGE, engine: env.SANDBOX_PROVIDER });
    return provider;
  }

  // Otherwise the dev stub, which never executes code and is refused in prod.
  if (env.NODE_ENV === "production") {
    throw Errors.config(
      "No production-safe sandbox provider is configured (set SANDBOX_PROVIDER=docker). Untrusted code execution is disabled.",
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

/** Whether a configured sandbox can run untrusted code (container engine set). */
export function hasProductionSandbox(): boolean {
  return env.SANDBOX_PROVIDER === "docker" || env.SANDBOX_PROVIDER === "podman";
}

/** Test seam. */
export function setSandboxProvider(p: SandboxProvider | undefined): void {
  provider = p;
}
