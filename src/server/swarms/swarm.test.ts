import { describe, expect, it } from "vitest";

import { executeSwarm, type PlannedAgent } from "@/server/swarms/executeSwarm";
import { mergeSwarmResults, type AgentResult } from "@/server/swarms/mergeSwarmResults";

describe("mergeSwarmResults", () => {
  const ok = (role: string, cost = 100): AgentResult => ({ role, output: { role }, costMinor: cost });
  const bad = (role: string): AgentResult => ({
    role,
    error: { code: "X", message: "boom" },
    costMinor: 0,
  });

  it("succeeds when all agents succeed", () => {
    const merged = mergeSwarmResults([ok("a"), ok("b")]);
    expect(merged.status).toBe("succeeded");
    expect(merged.totalCostMinor).toBe(200);
    expect(Object.keys(merged.byRole)).toEqual(["a", "b"]);
  });

  it("is partial under best_effort when some fail", () => {
    expect(mergeSwarmResults([ok("a"), bad("b")]).status).toBe("partial");
  });

  it("fails when all agents fail", () => {
    expect(mergeSwarmResults([bad("a"), bad("b")]).status).toBe("failed");
  });

  it("fail_fast taints the run on any failure", () => {
    expect(mergeSwarmResults([ok("a"), bad("b")], "fail_fast").status).toBe("failed");
  });
});

describe("executeSwarm", () => {
  const planned: PlannedAgent[] = [
    { role: "a", instructions: "" },
    { role: "b", instructions: "" },
  ];

  it("runs all children and aggregates a successful result", async () => {
    const result = await executeSwarm(planned, {
      budgetMinor: 1000,
      async runChild(agent) {
        return { output: { who: agent.role }, costMinor: 100, jobId: `job_${agent.role}` };
      },
    });
    expect(result.status).toBe("succeeded");
    expect(result.totalCostMinor).toBe(200);
    expect(result.agents).toHaveLength(2);
  });

  it("enforces the aggregate budget cap", async () => {
    await expect(
      executeSwarm(planned, {
        budgetMinor: 150,
        async runChild() {
          return { output: {}, costMinor: 100 };
        },
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("reports a child failure as partial (best effort)", async () => {
    const result = await executeSwarm(planned, {
      budgetMinor: 0,
      async runChild(agent) {
        if (agent.role === "b") {
          return { error: { code: "EXECUTION_FAILED", message: "child failed" }, costMinor: 0 };
        }
        return { output: { ok: true }, costMinor: 50 };
      },
    });
    expect(result.status).toBe("partial");
    expect(result.failures).toHaveLength(1);
  });
});
