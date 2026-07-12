/**
 * Simulation cost model and config resolution.
 *
 * Cost = base per agent + metered GPU (integer minor units throughout; floating
 * point is banned for money). One charge per simulation because the whole crew
 * runs in ONE sandbox:
 *
 *   estimatedCostMinor = agents * SIMULATION_AGENT_BASE_MINOR
 *                      + estimatedGpuSeconds * GPU_RATE_MINOR_PER_SECOND
 *
 * The GPU estimate is a heuristic refined by the actual seconds the sandbox
 * reports; the base fee is exact. `budgetMinor` is a HARD ceiling: the reserved
 * amount (base + maxGpuSeconds*rate) can never exceed it, and the sandbox is
 * told to stop at maxGpuSeconds so the committed charge is always ≤ reservation.
 */

import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { DEFAULT_ROUNDS } from "@/modules/simulations/schema";
import type { ResolvedSimulationConfig, SimulationConfigInput } from "@/modules/simulations/schema";
import { findFramework } from "@/server/simulations/frameworks";

/** Per-agent single-pass GPU seconds used to seed the parallel-mode estimate. */
const PARALLEL_SECONDS_PER_AGENT = 20;
/** Per-agent-per-round GPU seconds used to seed the collaborative-mode estimate. */
const COLLAB_SECONDS_PER_AGENT_ROUND = 8;
/** Fallback GPU seconds when there is no budget to derive a cap from. */
const DEFAULT_MAX_GPU_SECONDS = 600;

export interface SimulationEstimate {
  agents: number;
  mode: "parallel" | "collaborative";
  baseMinor: number;
  rateMinorPerSecond: number;
  estimatedGpuSeconds: number;
  /** Hard cap on GPU seconds the sandbox may bill (derived from budget). */
  maxGpuSeconds: number;
  estimatedCostMinor: number;
  /** base + maxGpuSeconds*rate — the amount reserved against the budget. */
  reservedMinor: number;
  currency: string;
  withinBudget: boolean;
  rejectionReason?: string;
}

/**
 * Merge a framework (if any) with the caller's request. Framework fields are
 * defaults; every explicit request field wins. Returns a config the engine can
 * run directly (agents non-empty, mode + model resolved).
 */
export function resolveSimulationConfig(input: SimulationConfigInput): ResolvedSimulationConfig {
  const framework = input.frameworkId !== undefined ? findFramework(input.frameworkId) : undefined;
  if (input.frameworkId !== undefined && !framework) {
    throw Errors.validation(
      `Unknown frameworkId: "${input.frameworkId}". See GET /api/v1/simulations/frameworks.`,
    );
  }

  const mode = input.mode ?? framework?.mode;
  if (!mode) throw Errors.validation("mode is required (parallel | collaborative)");

  const agents = input.agents.length > 0 ? input.agents : (framework?.personas ?? []);
  if (agents.length === 0) throw Errors.validation("At least one agent (persona) is required");

  const model = input.model ?? env.AGENT_DEFAULT_MODEL ?? "deepseek/deepseek-chat-v4";

  // Scenario: framework default, then shallow-override with the caller's scenario.
  const scenario =
    mode === "collaborative"
      ? { ...(framework?.scenario ?? {}), ...(input.scenario ?? {}) }
      : undefined;

  return {
    mode,
    frameworkId: input.frameworkId,
    objective: input.objective ?? framework?.objective,
    agents,
    model,
    scenario,
    aggregatorTask: input.aggregatorTask ?? framework?.aggregatorTask,
  };
}

/** Heuristic GPU-second estimate — refined by the actual sandbox metering. */
export function estimateGpuSeconds(config: ResolvedSimulationConfig): number {
  const n = config.agents.length;
  if (config.mode === "collaborative") {
    const rounds = config.scenario?.maxRounds ?? DEFAULT_ROUNDS;
    return Math.max(1, n * rounds * COLLAB_SECONDS_PER_AGENT_ROUND);
  }
  // parallel: agents run one pass each (+1 for an aggregator if present).
  const slots = n + (config.aggregatorTask ? 1 : 0);
  return Math.max(1, slots * PARALLEL_SECONDS_PER_AGENT);
}

/**
 * Price a resolved simulation. `budgetMinor` (when supplied) is the hard
 * ceiling; the reserved amount is clamped to it and maxGpuSeconds derived so the
 * eventual committed charge (base + actualGpu*rate) can never exceed the budget.
 */
export function estimateSimulationCost(
  config: ResolvedSimulationConfig,
  opts: { budgetMinor?: number; currency?: string } = {},
): SimulationEstimate {
  // Fallbacks: Zod defaults don't apply under SKIP_ENV_VALIDATION (build/test).
  const base = env.SIMULATION_AGENT_BASE_MINOR ?? 25;
  const rate = env.GPU_RATE_MINOR_PER_SECOND ?? 2;
  const currency = opts.currency ?? env.GPU_RATE_CURRENCY ?? "USD";

  const agents = config.agents.length;
  const baseMinor = agents * base;
  const estimatedGpuSeconds = estimateGpuSeconds(config);

  let maxGpuSeconds: number;
  let withinBudget = true;
  let rejectionReason: string | undefined;

  if (opts.budgetMinor !== undefined && opts.budgetMinor > 0) {
    const gpuBudget = opts.budgetMinor - baseMinor;
    if (rate > 0 && gpuBudget < rate) {
      // Budget cannot even cover the base fee + one GPU-second.
      withinBudget = false;
      maxGpuSeconds = 0;
      rejectionReason = `budgetMinor too low: need at least ${baseMinor + rate} minor units (base fee ${baseMinor} for ${agents} agents + ${rate} for one GPU-second)`;
    } else {
      maxGpuSeconds = rate > 0 ? Math.floor(gpuBudget / rate) : DEFAULT_MAX_GPU_SECONDS;
    }
  } else {
    // No budget: cap GPU at the heuristic estimate so an unbounded run can't
    // silently bill forever.
    maxGpuSeconds = Math.max(estimatedGpuSeconds, 1);
  }

  const billedGpuSeconds = Math.min(estimatedGpuSeconds, Math.max(maxGpuSeconds, 0));
  const estimatedCostMinor = baseMinor + billedGpuSeconds * rate;
  const reservedMinor = baseMinor + Math.max(maxGpuSeconds, 0) * rate;

  return {
    agents,
    mode: config.mode,
    baseMinor,
    rateMinorPerSecond: rate,
    estimatedGpuSeconds,
    maxGpuSeconds: Math.max(maxGpuSeconds, 0),
    estimatedCostMinor,
    reservedMinor,
    currency,
    withinBudget,
    ...(rejectionReason ? { rejectionReason } : {}),
  };
}
