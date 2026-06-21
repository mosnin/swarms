/**
 * Agent runner. Bridges the job runner interface to the agent runtime: it runs
 * the spawned worker agent on its task with the inherited resources and meters
 * GPU seconds, charging at most the budgeted ceiling (the agent cannot
 * overspend). Runs only in the worker.
 */

import { getAgentRuntime } from "@/server/agents/anthropicAgentRuntime";
import type { ResourceBundle } from "@/modules/resources/resource-bundle";
import type { Runner, RunnerContext, RunnerOutcome } from "@/server/runners/types";

export interface AgentRunnerConfig {
  task: string;
  model: string;
  resources: ResourceBundle;
  maxGpuSeconds: number;
  rateMinorPerSecond: number;
}

export class AgentRunner implements Runner {
  readonly type = "agent" as const;

  async run(context: RunnerContext): Promise<RunnerOutcome> {
    const config = context.runnerConfig as AgentRunnerConfig;
    const outcome = await getAgentRuntime().run({
      jobId: context.jobId,
      organizationId: context.organizationId,
      task: config.task,
      resources: config.resources ?? {},
      model: config.model,
      maxRuntimeMs: context.maxRuntimeMs,
    });

    // Charge for metered GPU seconds, hard-capped at the budgeted ceiling.
    const billedSeconds = Math.min(outcome.gpuSeconds, config.maxGpuSeconds);
    const costMinor = billedSeconds * config.rateMinorPerSecond;
    const logs = outcome.logs.map((l) => ({ level: l.level, message: l.message, data: l.data }));

    if (outcome.ok) {
      return { ok: true, output: outcome.result, costMinor, logs };
    }
    return { ok: false, error: outcome.error, logs };
  }
}
