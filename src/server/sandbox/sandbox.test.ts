import { describe, expect, it } from "vitest";

import { hasProductionSandbox } from "@/server/sandbox/sandboxProvider";
import { LocalStubSandboxProvider } from "@/server/sandbox/localStubSandboxProvider";
import { DEFAULT_SANDBOX_LIMITS, type SandboxSpec } from "@/server/sandbox/types";

const spec: SandboxSpec = {
  jobId: "job_1",
  organizationId: "org_1",
  skillVersionId: "skv_1",
  limits: DEFAULT_SANDBOX_LIMITS,
};

describe("sandbox safety posture", () => {
  it("reports no production-safe sandbox", () => {
    expect(hasProductionSandbox()).toBe(false);
  });

  it("the local stub is explicitly not production safe", () => {
    expect(new LocalStubSandboxProvider().isProductionSafe).toBe(false);
  });

  it("default limits deny egress by default", () => {
    expect(DEFAULT_SANDBOX_LIMITS.egressAllowlist).toEqual([]);
  });
});

describe("local stub never executes code", () => {
  it("refuses runCommand", async () => {
    const provider = new LocalStubSandboxProvider();
    const handle = await provider.createSandbox(spec);
    await expect(provider.runCommand(handle, "echo", ["hi"])).rejects.toMatchObject({
      code: "SANDBOX_FAILURE",
    });
  });

  it("supports the file interface for testing artifact collection", async () => {
    const provider = new LocalStubSandboxProvider();
    const handle = await provider.createSandbox(spec);
    await provider.writeFile(handle, "out.json", new TextEncoder().encode("{}"));
    const artifacts = await provider.collectArtifacts(handle);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.path).toBe("out.json");
    await provider.terminateSandbox(handle);
  });
});
