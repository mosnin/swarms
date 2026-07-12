import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import {
  estimateGpuSeconds,
  estimateSimulationCost,
  resolveSimulationConfig,
} from "@/server/simulations/cost";
import type { SimulationConfigInput } from "@/modules/simulations/schema";

const BASE = env.SIMULATION_AGENT_BASE_MINOR ?? 25;
const RATE = env.GPU_RATE_MINOR_PER_SECOND ?? 2;

function input(overrides: Partial<SimulationConfigInput> = {}): SimulationConfigInput {
  return {
    mode: "parallel",
    agents: [{ name: "A" }, { name: "B" }],
    ...overrides,
  } as SimulationConfigInput;
}

describe("resolveSimulationConfig", () => {
  it("applies a framework's defaults when the caller supplies none", () => {
    const resolved = resolveSimulationConfig({ mode: "collaborative", frameworkId: "icp-panel", agents: [] } as never);
    expect(resolved.agents.length).toBeGreaterThan(0);
    expect(resolved.mode).toBe("collaborative");
    expect(resolved.aggregatorTask).toBeTruthy();
  });

  it("caller fields win over framework defaults", () => {
    const resolved = resolveSimulationConfig({
      mode: "collaborative",
      frameworkId: "icp-panel",
      objective: "custom objective",
      agents: [{ name: "Only Me" }],
    } as never);
    expect(resolved.agents).toHaveLength(1);
    expect(resolved.agents[0]?.name).toBe("Only Me");
    expect(resolved.objective).toBe("custom objective");
  });

  it("rejects an unknown frameworkId", () => {
    expect(() => resolveSimulationConfig(input({ frameworkId: "nope" }))).toThrow(/Unknown frameworkId/);
  });
});

describe("estimateSimulationCost", () => {
  it("bills a base fee per agent plus metered GPU (integer minor units)", () => {
    const config = resolveSimulationConfig(input());
    const est = estimateSimulationCost(config);
    expect(est.agents).toBe(2);
    expect(est.baseMinor).toBe(2 * BASE);
    // reserved = base + maxGpuSeconds*rate; every value is an integer.
    expect(est.reservedMinor).toBe(est.baseMinor + est.maxGpuSeconds * RATE);
    expect(Number.isInteger(est.estimatedCostMinor)).toBe(true);
    expect(est.estimatedCostMinor).toBeLessThanOrEqual(est.reservedMinor);
  });

  it("collaborative scales GPU with agents × rounds", () => {
    const parallel = resolveSimulationConfig(input({ mode: "parallel" }));
    const collab = resolveSimulationConfig(input({ mode: "collaborative", scenario: { maxRounds: 10 } }));
    expect(estimateGpuSeconds(collab)).toBeGreaterThan(estimateGpuSeconds(parallel));
  });

  it("clamps the reservation to the budget ceiling so a charge can never exceed it", () => {
    const config = resolveSimulationConfig(input());
    const budgetMinor = 2 * BASE + 3 * RATE; // base + room for 3 GPU-seconds
    const est = estimateSimulationCost(config, { budgetMinor });
    expect(est.withinBudget).toBe(true);
    expect(est.reservedMinor).toBeLessThanOrEqual(budgetMinor);
    expect(est.maxGpuSeconds).toBe(3);
  });

  it("rejects a budget too low to cover the base fee + one GPU-second", () => {
    const config = resolveSimulationConfig(input());
    const est = estimateSimulationCost(config, { budgetMinor: 2 * BASE }); // no room for GPU
    expect(est.withinBudget).toBe(false);
    expect(est.rejectionReason).toMatch(/too low/);
  });
});
