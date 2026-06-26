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
    { role: "a", instructions: "step-a" },
    { role: "b", instructions: "step-b" },
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

// ── Feature 1: Sequential context threading ──────────────────────────────────

describe("executeSwarm — sequential context threading", () => {
  it("threads each worker's output into the next worker's instructions", async () => {
    const received: Array<{ role: string; previousOutput: unknown }> = [];

    await executeSwarm(
      [
        { role: "step-1", instructions: "do A" },
        { role: "step-2", instructions: "do B" },
        { role: "step-3", instructions: "do C" },
      ],
      {
        budgetMinor: 0,
        parallel: false,
        async runChild(agent) {
          received.push({ role: agent.role, previousOutput: agent.previousOutput });
          return { output: `result-of-${agent.role}`, costMinor: 10 };
        },
      },
    );

    expect(received[0]?.previousOutput).toBeUndefined();
    expect(received[1]?.previousOutput).toBe("result-of-step-1");
    expect(received[2]?.previousOutput).toBe("result-of-step-2");
  });

  it("does not advance previousOutput when a worker fails", async () => {
    const received: Array<unknown> = [];

    await executeSwarm(
      [
        { role: "s1", instructions: "ok" },
        { role: "s2", instructions: "fail" },
        { role: "s3", instructions: "after-fail" },
      ],
      {
        budgetMinor: 0,
        parallel: false,
        async runChild(agent) {
          received.push(agent.previousOutput);
          if (agent.role === "s2") return { error: { code: "X", message: "boom" }, costMinor: 0 };
          return { output: `out-${agent.role}`, costMinor: 5 };
        },
      },
    );

    expect(received[0]).toBeUndefined();           // s1 has no prior
    expect(received[1]).toBe("out-s1");            // s2 sees s1's output
    expect(received[2]).toBe("out-s1");            // s3 sees s1's output (s2 failed)
  });

  it("parallel mode does NOT thread previous output", async () => {
    const received: Array<unknown> = [];

    await executeSwarm(
      [
        { role: "p1", instructions: "x" },
        { role: "p2", instructions: "y" },
      ],
      {
        budgetMinor: 0,
        parallel: true,
        async runChild(agent) {
          received.push(agent.previousOutput);
          return { output: "out", costMinor: 5 };
        },
      },
    );

    expect(received.every((v) => v === undefined)).toBe(true);
  });
});

// ── Feature 2: Aggregator agent (Mixture-of-Agents) ─────────────────────────

describe("executeSwarm — aggregator agent", () => {
  it("spawns an aggregator after workers and includes its output in the result", async () => {
    const calls: string[] = [];

    const result = await executeSwarm(
      [
        { role: "worker-1", instructions: "do X" },
        { role: "worker-2", instructions: "do Y" },
      ],
      {
        budgetMinor: 0,
        aggregatorTask: "Synthesise the results",
        async runChild(agent) {
          calls.push(agent.role);
          if (agent.role === "aggregator") {
            return { output: { synthesised: true, saw: agent.instructions }, costMinor: 5 };
          }
          return { output: `out-${agent.role}`, costMinor: 10 };
        },
      },
    );

    expect(calls).toContain("aggregator");
    expect(result.aggregatorOutput).toMatchObject({ synthesised: true });
    // Aggregator instructions must include worker outputs.
    expect((result.aggregatorOutput as { saw: string }).saw).toContain("out-worker-1");
    expect((result.aggregatorOutput as { saw: string }).saw).toContain("out-worker-2");
  });

  it("includes aggregator cost in totalCostMinor", async () => {
    const result = await executeSwarm(
      [{ role: "w", instructions: "task" }],
      {
        budgetMinor: 0,
        aggregatorTask: "merge",
        async runChild() {
          return { output: "ok", costMinor: 20 };
        },
      },
    );
    // 20 (worker) + 20 (aggregator) = 40
    expect(result.totalCostMinor).toBe(40);
  });

  it("skips the aggregator when all workers fail", async () => {
    const calls: string[] = [];

    const result = await executeSwarm(
      [{ role: "w", instructions: "task" }],
      {
        budgetMinor: 0,
        aggregatorTask: "merge",
        async runChild(agent) {
          calls.push(agent.role);
          return { error: { code: "FAIL", message: "boom" }, costMinor: 0 };
        },
      },
    );

    expect(calls).not.toContain("aggregator");
    expect(result.aggregatorOutput).toBeUndefined();
  });

  it("budget check includes aggregator cost", async () => {
    await expect(
      executeSwarm(
        [{ role: "w", instructions: "task" }],
        {
          budgetMinor: 25,
          aggregatorTask: "merge",
          async runChild() {
            return { output: "ok", costMinor: 20 };
          },
        },
      ),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
});
