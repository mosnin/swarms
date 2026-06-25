/**
 * Swarm executor (port-based, testable). Runs each planned agent through a
 * caller-provided `runChild` (which, in production, creates and processes a real
 * child job via the existing job system), enforces the aggregate budget cap, and
 * merges results. Children run via a Promise-based local adapter; the same shape
 * supports a production queue-backed fan-out.
 */

import { Errors } from "@/lib/errors";
import {
  mergeSwarmResults,
  type AgentResult,
  type FailurePolicy,
  type MergedSwarmResult,
} from "@/server/swarms/mergeSwarmResults";

/** One worker in a swarm: a role label and the task it runs. */
export interface PlannedAgent {
  role: string;
  instructions: string;
}

export interface ChildOutcome {
  output?: unknown;
  error?: { code: string; message: string } | null;
  costMinor: number;
  jobId?: string;
}

export interface ExecuteSwarmDeps {
  /** Execute one agent's subtask, returning its outcome + cost. */
  runChild(agent: PlannedAgent, index: number): Promise<ChildOutcome>;
  /** Aggregate budget cap in minor units (0 = unlimited). */
  budgetMinor: number;
  failurePolicy?: FailurePolicy;
  /** Run children concurrently (default) or sequentially. */
  parallel?: boolean;
}

export interface SwarmExecutionResult extends MergedSwarmResult {
  agents: Array<AgentResult & { jobId?: string }>;
}

export async function executeSwarm(
  planned: readonly PlannedAgent[],
  deps: ExecuteSwarmDeps,
): Promise<SwarmExecutionResult> {
  const parallel = deps.parallel ?? true;
  const outcomes: Array<{ agent: PlannedAgent; outcome: ChildOutcome }> = [];

  if (parallel) {
    const results = await Promise.all(
      planned.map(async (agent, i) => ({ agent, outcome: await deps.runChild(agent, i) })),
    );
    outcomes.push(...results);
  } else {
    for (let i = 0; i < planned.length; i += 1) {
      const agent = planned[i]!;
      outcomes.push({ agent, outcome: await deps.runChild(agent, i) });
    }
  }

  // Enforce aggregate budget after children report their cost.
  const totalCost = outcomes.reduce((acc, o) => acc + o.outcome.costMinor, 0);
  if (deps.budgetMinor > 0 && totalCost > deps.budgetMinor) {
    throw Errors.budgetExceeded("Swarm exceeded its aggregate budget", {
      budgetMinor: deps.budgetMinor,
      totalCostMinor: totalCost,
    });
  }

  const agentResults: Array<AgentResult & { jobId?: string }> = outcomes.map(({ agent, outcome }) => ({
    role: agent.role,
    output: outcome.output,
    error: outcome.error ?? null,
    costMinor: outcome.costMinor,
    jobId: outcome.jobId,
  }));

  const merged = mergeSwarmResults(agentResults, deps.failurePolicy);
  return { ...merged, agents: agentResults };
}
