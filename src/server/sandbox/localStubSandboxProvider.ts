/**
 * LOCAL DEV ADAPTER — local stub sandbox provider.
 *
 * ⚠️  THIS IS NOT A SECURE SANDBOX. ⚠️
 *
 * It provides NO isolation: no separate kernel/namespace, no real CPU/memory
 * limits, no enforced egress policy, no filesystem jail. It exists ONLY so the
 * sandbox INTERFACE can be exercised in development and tests. It deliberately
 * refuses to actually execute commands, so it can never be used as a backdoor to
 * run untrusted code on the host. `isProductionSafe` is always `false`.
 */

import { createHash } from "node:crypto";

import { Errors } from "@/lib/errors";
import type {
  CommandResult,
  SandboxArtifact,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "@/server/sandbox/types";

export class LocalStubSandboxProvider implements SandboxProvider {
  readonly kind = "local-stub";
  readonly isProductionSafe = false;

  private readonly files = new Map<string, Map<string, Uint8Array>>();

  async createSandbox(spec: SandboxSpec): Promise<SandboxHandle> {
    const id = `sbx_stub_${spec.jobId}`;
    this.files.set(id, new Map());
    return { id, spec };
  }

  async uploadSkillBundle(_handle: SandboxHandle, _bundle: Uint8Array): Promise<void> {
    // No-op: the stub never materializes or runs skill code.
  }

  async runCommand(
    _handle: SandboxHandle,
    _command: string,
    _args: string[],
  ): Promise<CommandResult> {
    // Refuse to execute. A real provider runs the command inside the isolate.
    throw Errors.sandboxFailure(
      "local-stub sandbox cannot execute commands; it is not a secure sandbox",
    );
  }

  async writeFile(handle: SandboxHandle, path: string, data: Uint8Array): Promise<void> {
    this.files.get(handle.id)?.set(path, data);
  }

  async readFile(handle: SandboxHandle, path: string): Promise<Uint8Array> {
    const file = this.files.get(handle.id)?.get(path);
    if (!file) throw Errors.notFound(`No such file in sandbox: ${path}`);
    return file;
  }

  async collectArtifacts(handle: SandboxHandle): Promise<SandboxArtifact[]> {
    const files = this.files.get(handle.id) ?? new Map();
    return [...files.entries()].map(([path, data]) => ({
      path,
      sizeBytes: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
    }));
  }

  async terminateSandbox(handle: SandboxHandle): Promise<void> {
    this.files.delete(handle.id);
  }
}
