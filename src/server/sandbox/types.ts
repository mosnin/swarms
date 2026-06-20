/**
 * Sandbox provider abstraction. A sandbox is the isolated environment in which
 * an untrusted skill's own code would run. Hermes Cloud defines the interface
 * and ships only a **development stub** today — there is no production-safe
 * sandbox in this repo, and no path executes arbitrary third-party code.
 *
 * Every production sandbox MUST satisfy the requirements in
 * docs/SANDBOX_RUNTIME.md (network policy per job, filesystem isolation, CPU /
 * memory / time limits, no host-secret access, connector access only through a
 * broker, output size limits, artifact scanning, and a full audit trail).
 */

export interface SandboxLimits {
  cpuMillis: number;
  memoryMb: number;
  timeoutMs: number;
  /** Maximum aggregate output/artifact size in bytes. */
  maxOutputBytes: number;
  /** Per-job egress policy: explicit allowlist of hosts, default deny-all. */
  egressAllowlist: string[];
}

export interface SandboxSpec {
  jobId: string;
  organizationId: string;
  skillVersionId: string;
  limits: SandboxLimits;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SandboxArtifact {
  path: string;
  sizeBytes: number;
  /** Provider-computed digest; used by the (placeholder) artifact scanner. */
  sha256: string;
}

export interface SandboxHandle {
  id: string;
  spec: SandboxSpec;
}

export interface SandboxProvider {
  readonly kind: string;
  /** Whether this provider is safe to run untrusted third-party code. */
  readonly isProductionSafe: boolean;

  createSandbox(spec: SandboxSpec): Promise<SandboxHandle>;
  uploadSkillBundle(handle: SandboxHandle, bundle: Uint8Array): Promise<void>;
  runCommand(handle: SandboxHandle, command: string, args: string[]): Promise<CommandResult>;
  readFile(handle: SandboxHandle, path: string): Promise<Uint8Array>;
  writeFile(handle: SandboxHandle, path: string, data: Uint8Array): Promise<void>;
  collectArtifacts(handle: SandboxHandle): Promise<SandboxArtifact[]>;
  terminateSandbox(handle: SandboxHandle): Promise<void>;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  cpuMillis: 1000,
  memoryMb: 256,
  timeoutMs: 30_000,
  maxOutputBytes: 1_000_000,
  egressAllowlist: [], // deny-all by default
};
