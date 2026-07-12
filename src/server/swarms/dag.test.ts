import { describe, expect, it } from "vitest";

import { topologicalWaves, validateDag } from "@/server/swarms/dag";
import { executeSwarm, type PlannedAgent } from "@/server/swarms/executeSwarm";

describe("validateDag", () => {
  it("accepts a valid diamond", () => {
    expect(() =>
      validateDag([
        { name: "a" },
        { name: "b", dependsOn: ["a"] },
        { name: "c", dependsOn: ["a"] },
        { name: "d", dependsOn: ["b", "c"] },
      ]),
    ).not.toThrow();
  });

  it("rejects duplicate names, unknown deps, self-deps, and cycles", () => {
    expect(() => validateDag([{ name: "a" }, { name: "a" }])).toThrow(/Duplicate/);
    expect(() => validateDag([{ name: "a", dependsOn: ["ghost"] }])).toThrow(/unknown step/);
    expect(() => validateDag([{ name: "a", dependsOn: ["a"] }])).toThrow(/itself/);
    expect(() =>
      validateDag([
        { name: "a", dependsOn: ["b"] },
        { name: "b", dependsOn: ["a"] },
      ]),
    ).toThrow(/cycle/);
  });
});

describe("topologicalWaves", () => {
  it("groups independent steps into shared waves", () => {
    const waves = topologicalWaves([
      { name: "a" },
      { name: "b", dependsOn: ["a"] },
      { name: "c", dependsOn: ["a"] },
      { name: "d", dependsOn: ["b", "c"] },
    ]);
    expect(waves).toEqual([[0], [1, 2], [3]]);
  });
});

describe("executeSwarm (dag mode)", () => {
  const diamond: PlannedAgent[] = [
    { role: "a", instructions: "root" },
    { role: "b", instructions: "left", dependsOn: ["a"] },
    { role: "c", instructions: "right", dependsOn: ["a"] },
    { role: "d", instructions: "join", dependsOn: ["b", "c"] },
  ];

  it("threads dependency outputs into dependants", async () => {
    const seen = new Map<string, unknown>();
    const result = await executeSwarm(diamond, {
      dag: true,
      budgetMinor: 0,
      async runChild(agent) {
        seen.set(agent.role, agent.previousOutput);
        return { output: `out-${agent.role}`, costMinor: 10 };
      },
    });
    expect(result.status).toBe("succeeded");
    expect(seen.get("a")).toBeUndefined();
    expect(seen.get("b")).toEqual({ a: "out-a" });
    expect(seen.get("d")).toEqual({ b: "out-b", c: "out-c" });
    expect(result.totalCostMinor).toBe(40);
  });

  it("cascade-skips dependants of a failed step at zero cost", async () => {
    const result = await executeSwarm(diamond, {
      dag: true,
      budgetMinor: 0,
      async runChild(agent) {
        if (agent.role === "b") {
          return { output: null, error: { code: "X", message: "boom" }, costMinor: 5 };
        }
        return { output: `out-${agent.role}`, costMinor: 10 };
      },
    });
    const byRole = new Map(result.agents.map((a) => [a.role, a]));
    expect(byRole.get("a")?.error).toBeNull();
    expect(byRole.get("c")?.error).toBeNull();
    expect(byRole.get("b")?.error?.code).toBe("X");
    expect(byRole.get("d")?.error?.code).toBe("DEPENDENCY_FAILED");
    expect(byRole.get("d")?.costMinor).toBe(0);
    expect(result.status).toBe("partial");
  });
});
