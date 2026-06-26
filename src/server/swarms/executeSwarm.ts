/**
 * Swarm executor (port-based, testable). Runs each planned agent through a
 * caller-provided `runChild` (which, in production, creates and processes a real
 * child job via the existing job system), enforces the aggregate budget cap, and
 * merges results. Children run via a Promise-based local adapter; the same shape
 * supports a production queue-backed fan-out.
 *
 * Sequential mode: each worker's output is threaded into the next worker's task
 * as context, enabling pipeline-style workflows (scrape → extract → summarize).
 *
 * Aggregator: after all workers complete, an optional aggregator agent receives
 * every worker's output and synthesises a single result (Mixture-of-Agents).
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
  /**
   * Output of the preceding worker (sequential mode only). Set by executeSwarm;
   * callers should not provide this — it is injected between iterations.
   */
  previousOutput?: unknown;
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
  /**
   * Optional aggregator task (Mixture-of-Agents). When provided, a final
   * aggregator agent is spawned after all workers complete. Its instructions
   * are this string, prefixed with a formatted summary of all worker outputs.
   * The aggregator is skipped when ALL workers failed (no outputs to aggregate).
   */
  aggregatorTask?: string;
}

export interface SwarmExecutionResult extends MergedSwarmResult {
  agents: Array<AgentResult & { jobId?: string }>;
  /** Output from the aggregator agent, if one was requested and ran. */
  aggregatorOutput?: unknown;
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
    // Sequential: thread each worker's output into the next worker as context.
    let previousOutput: unknown = undefined;
    for (let i = 0; i < planned.length; i += 1) {
      const agent: PlannedAgent = { ...planned[i]!, previousOutput };
      const outcome = await deps.runChild(agent, i);
      outcomes.push({ agent, outcome });
      // Only thread successful output forward — failures leave previousOutput unchanged.
      if (!outcome.error) {
        previousOutput = outcome.output;
      }
    }
  }

  const agentResults: Array<AgentResult & { jobId?: string }> = outcomes.map(({ agent, outcome }) => ({
    role: agent.role,
    output: outcome.output,
    error: outcome.error ?? null,
    costMinor: outcome.costMinor,
    jobId: outcome.jobId,
  }));

  // Run the aggregator after workers (if requested and at least one worker succeeded).
  let aggregatorOutput: unknown = undefined;
  let aggregatorCostMinor = 0;
  if (deps.aggregatorTask) {
    const hasSuccesses = agentResults.some((a) => !a.error);
    if (hasSuccesses) {
      const workerSummary = agentResults
        .filter((a) => !a.error)
        .map((a) => `[${a.role}]:\n${typeof a.output === "string" ? a.output : JSON.stringify(a.output, null, 2)}`)
        .join("\n\n");
      const aggregatorInstructions = `${deps.aggregatorTask}\n\nWorker outputs to synthesise:\n${workerSummary}`;
      const aggregatorAgent: PlannedAgent = { role: "aggregator", instructions: aggregatorInstructions };
      const aggOutcome = await deps.runChild(aggregatorAgent, agentResults.length);
      aggregatorOutput = aggOutcome.output;
      aggregatorCostMinor = aggOutcome.costMinor;
    }
  }

  // Enforce aggregate budget after all work (workers + aggregator).
  const totalCost = agentResults.reduce((acc, a) => acc + a.costMinor, 0) + aggregatorCostMinor;
  if (deps.budgetMinor > 0 && totalCost > deps.budgetMinor) {
    throw Errors.budgetExceeded("Swarm exceeded its aggregate budget", {
      budgetMinor: deps.budgetMinor,
      totalCostMinor: totalCost,
    });
  }

  const merged = mergeSwarmResults(agentResults, deps.failurePolicy);
  return {
    ...merged,
    totalCostMinor: merged.totalCostMinor + aggregatorCostMinor,
    agents: agentResults,
    aggregatorOutput,
  };
}
