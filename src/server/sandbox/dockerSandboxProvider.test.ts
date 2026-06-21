import { describe, expect, it, vi } from "vitest";

import { DockerSandboxProvider, type CommandRunner } from "@/server/sandbox/dockerSandboxProvider";
import { DEFAULT_SANDBOX_LIMITS, type SandboxSpec } from "@/server/sandbox/types";

const spec: SandboxSpec = {
  jobId: "job_1",
  organizationId: "org_1",
  skillVersionId: "skv_1",
  limits: { ...DEFAULT_SANDBOX_LIMITS, memoryMb: 256, cpuMillis: 500, timeoutMs: 5000 },
};

function ok(stdout = ""): { code: number; stdout: string; stderr: string; timedOut: boolean } {
  return { code: 0, stdout, stderr: "", timedOut: false };
}

describe("DockerSandboxProvider", () => {
  it("creates a container with hardened isolation flags", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (file, args) => {
      calls.push([file, ...args]);
      return ok("container_id");
    };
    const provider = new DockerSandboxProvider({ image: "img:latest", runner });
    expect(provider.isProductionSafe).toBe(true);

    await provider.createSandbox(spec);
    const create = calls[0]!.join(" ");
    expect(create).toContain("--network=none");
    expect(create).toContain("--read-only");
    expect(create).toContain("--memory=256m");
    expect(create).toContain("--cap-drop=ALL");
    expect(create).toContain("--security-opt=no-new-privileges");
    expect(create).toContain("--user=65534:65534");
  });

  it("runs a command and truncates output to the limit", async () => {
    const runner: CommandRunner = async (_file, args) => {
      if (args[0] === "run") return ok("name");
      if (args[0] === "exec") return ok("X".repeat(10_000));
      return ok();
    };
    const provider = new DockerSandboxProvider({ image: "img", runner });
    const handle = await provider.createSandbox({
      ...spec,
      limits: { ...spec.limits, maxOutputBytes: 100 },
    });
    const result = await provider.runCommand(handle, "echo", ["hi"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(100);
  });

  it("surfaces a create failure as a sandbox error", async () => {
    const runner: CommandRunner = async () => ({ code: 1, stdout: "", stderr: "boom", timedOut: false });
    const provider = new DockerSandboxProvider({ image: "img", runner });
    await expect(provider.createSandbox(spec)).rejects.toMatchObject({ code: "SANDBOX_FAILURE" });
  });

  it("terminate removes the container and never throws", async () => {
    const runner = vi.fn<CommandRunner>(async () => ok());
    const provider = new DockerSandboxProvider({ image: "img", runner });
    const handle = await provider.createSandbox(spec);
    await provider.terminateSandbox(handle);
    expect(runner).toHaveBeenCalledWith("docker", ["rm", "-f", handle.id], expect.anything());
  });
});
