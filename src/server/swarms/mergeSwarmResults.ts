/**
 * Merge per-agent results into one structured swarm result. Pure and
 * deterministic. Reports per-role outputs, the list of failures, and an overall
 * status derived from the declared failure policy.
 */

export interface AgentResult {
  role: string;
  output?: unknown;
  error?: { code: string; message: string } | null;
  costMinor: number;
}

export type FailurePolicy = "fail_fast" | "best_effort";

export interface MergedSwarmResult {
  status: "succeeded" | "partial" | "failed";
  byRole: Record<string, unknown>;
  failures: Array<{ role: string; error: { code: string; message: string } }>;
  totalCostMinor: number;
}

export function mergeSwarmResults(
  agents: readonly AgentResult[],
  policy: FailurePolicy = "best_effort",
): MergedSwarmResult {
  const byRole: Record<string, unknown> = {};
  const failures: MergedSwarmResult["failures"] = [];
  let totalCostMinor = 0;

  for (const agent of agents) {
    totalCostMinor += agent.costMinor;
    if (agent.error) {
      failures.push({ role: agent.role, error: agent.error });
    } else {
      byRole[agent.role] = agent.output ?? null;
    }
  }

  let status: MergedSwarmResult["status"];
  if (failures.length === 0) {
    status = "succeeded";
  } else if (failures.length === agents.length) {
    status = "failed";
  } else {
    // Any failure under fail_fast taints the whole run; best_effort is partial.
    status = policy === "fail_fast" ? "failed" : "partial";
  }

  return { status, byRole, failures, totalCostMinor };
}
