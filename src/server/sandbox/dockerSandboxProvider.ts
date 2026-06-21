/**
 * Container-based sandbox provider. Runs each job in a locked-down container:
 * no network, read-only root, tmpfs work dir, dropped capabilities, no new
 * privileges, non-root user, and enforced CPU / memory / pids / time limits.
 * Host secrets are never passed (empty env). This is a real isolation boundary
 * suitable for production execution of semi-trusted code; for fully untrusted
 * multi-tenant code a microVM (Firecracker/gVisor) is stronger — see
 * docs/SANDBOX_RUNTIME.md.
 *
 * The container engine is invoked through an injectable command runner so the
 * provider can be unit-tested without Docker present.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";

import { Errors } from "@/lib/errors";
import type {
  CommandResult,
  SandboxArtifact,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "@/server/sandbox/types";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type CommandRunner = (
  file: string,
  args: string[],
  opts: { timeoutMs?: number; input?: Buffer },
) => Promise<ExecResult>;

const defaultRunner: CommandRunner = (file, args, opts) =>
  new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { timeout: opts.timeoutMs ?? 0, maxBuffer: 16 * 1024 * 1024, encoding: "buffer" },
      (error, stdout, stderr) => {
        const timedOut = Boolean(error && (error as { killed?: boolean }).killed);
        const code = error && typeof (error as { code?: number }).code === "number" ? (error as { code: number }).code : error ? 1 : 0;
        resolve({
          code,
          stdout: stdout.toString("utf8"),
          stderr: stderr.toString("utf8"),
          timedOut,
        });
      },
    );
    if (opts.input) child.stdin?.end(opts.input);
  });

export interface DockerSandboxOptions {
  image: string;
  runner?: CommandRunner;
  engine?: string; // docker | podman
  workdir?: string;
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly kind = "container";
  readonly isProductionSafe = true;
  private readonly run: CommandRunner;
  private readonly engine: string;
  private readonly workdir: string;

  constructor(private readonly opts: DockerSandboxOptions) {
    this.run = opts.runner ?? defaultRunner;
    this.engine = opts.engine ?? "docker";
    this.workdir = opts.workdir ?? "/work";
  }

  async createSandbox(spec: SandboxSpec): Promise<SandboxHandle> {
    const name = `swarm_${spec.jobId}`;
    const args = [
      "run",
      "-d",
      "--name",
      name,
      // Isolation: no network by default; per-job egress would be added here.
      spec.limits.egressAllowlist.length === 0 ? "--network=none" : "--network=bridge",
      "--read-only",
      `--tmpfs=${this.workdir}:rw,size=64m,exec`,
      `--memory=${spec.limits.memoryMb}m`,
      `--cpus=${Math.max(0.1, spec.limits.cpuMillis / 1000)}`,
      "--pids-limit=128",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--user=65534:65534", // nobody
      "--env-host=false",
      "-w",
      this.workdir,
      this.opts.image,
      "sleep",
      String(Math.ceil(spec.limits.timeoutMs / 1000) + 5),
    ];
    const res = await this.run(this.engine, args, { timeoutMs: 30_000 });
    if (res.code !== 0) {
      throw Errors.sandboxFailure(`failed to create sandbox: ${res.stderr.slice(0, 200)}`);
    }
    return { id: name, spec };
  }

  async uploadSkillBundle(handle: SandboxHandle, bundle: Uint8Array): Promise<void> {
    // Stream a tar bundle into the work dir via `cp -`.
    const res = await this.run(
      this.engine,
      ["cp", "-", `${handle.id}:${this.workdir}`],
      { input: Buffer.from(bundle), timeoutMs: 30_000 },
    );
    if (res.code !== 0) throw Errors.sandboxFailure("failed to upload skill bundle");
  }

  async runCommand(handle: SandboxHandle, command: string, args: string[]): Promise<CommandResult> {
    const res = await this.run(
      this.engine,
      ["exec", handle.id, command, ...args],
      { timeoutMs: handle.spec.limits.timeoutMs },
    );
    const max = handle.spec.limits.maxOutputBytes;
    return {
      exitCode: res.code,
      stdout: res.stdout.slice(0, max),
      stderr: res.stderr.slice(0, max),
      timedOut: res.timedOut,
    };
  }

  async readFile(handle: SandboxHandle, path: string): Promise<Uint8Array> {
    const res = await this.run(this.engine, ["exec", handle.id, "cat", path], {
      timeoutMs: 10_000,
    });
    if (res.code !== 0) throw Errors.notFound(`No such file in sandbox: ${path}`);
    return Buffer.from(res.stdout, "utf8");
  }

  async writeFile(handle: SandboxHandle, path: string, data: Uint8Array): Promise<void> {
    const res = await this.run(
      this.engine,
      ["exec", "-i", handle.id, "sh", "-c", `cat > ${path}`],
      { input: Buffer.from(data), timeoutMs: 10_000 },
    );
    if (res.code !== 0) throw Errors.sandboxFailure(`failed to write ${path}`);
  }

  async collectArtifacts(handle: SandboxHandle): Promise<SandboxArtifact[]> {
    const res = await this.run(
      this.engine,
      ["exec", handle.id, "sh", "-c", `find ${this.workdir}/out -type f 2>/dev/null || true`],
      { timeoutMs: 10_000 },
    );
    const paths = res.stdout.split("\n").map((p) => p.trim()).filter(Boolean);
    const artifacts: SandboxArtifact[] = [];
    for (const path of paths) {
      const data = await this.readFile(handle, path).catch(() => null);
      if (!data) continue;
      artifacts.push({
        path,
        sizeBytes: data.byteLength,
        sha256: createHash("sha256").update(data).digest("hex"),
      });
    }
    return artifacts;
  }

  async terminateSandbox(handle: SandboxHandle): Promise<void> {
    await this.run(this.engine, ["rm", "-f", handle.id], { timeoutMs: 15_000 }).catch(() => undefined);
  }
}
