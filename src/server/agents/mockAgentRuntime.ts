/**
 * LOCAL DEV ADAPTER — deterministic mock agent runtime. It does not call a real
 * model; it produces a structured, reproducible result and reports exactly which
 * inherited resources it received (env keys, file paths, MCP servers, context),
 * so the full spawn → resource-inheritance → result → metering → payment loop is
 * exercisable offline. GPU seconds are derived deterministically from the task.
 */

import { summarize } from "@/modules/resources/resource-bundle";
import type { AgentRunInput, AgentRunResult, AgentRuntime } from "@/server/agents/types";

export class MockAgentRuntime implements AgentRuntime {
  readonly kind = "mock";

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const summary = summarize(input.resources);
    // Deterministic compute estimate: ~1 GPU-second per 40 chars of task, min 1.
    const gpuSeconds = Math.max(1, Math.ceil(input.task.length / 40));

    return {
      ok: true,
      gpuSeconds,
      result: {
        producedBy: "mock-agent-runtime",
        model: input.model,
        task: input.task,
        // Proves the agent received the parent's resources to work with.
        inheritedResources: summary,
        summary: `Completed task: ${input.task.slice(0, 120)}`,
        usedContext: summary.hasContext,
      },
      logs: [
        { level: "info", message: `Agent started on ${input.model}` },
        {
          level: "info",
          message: `Inherited ${summary.envKeys.length} secrets, ${summary.fileCount} files, ${summary.mcpServers.length} MCP servers`,
        },
        { level: "info", message: "Agent completed the task" },
      ],
    };
  }
}
