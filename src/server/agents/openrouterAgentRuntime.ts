/**
 * OpenRouter agent runtime, driven by the OpenAI Agents SDK.
 *
 * The spawned worker agent runs on a DeepSeek model served through OpenRouter
 * (an OpenAI-compatible API). The OpenAI Agents SDK (`@openai/agents`) runs the
 * agent loop; we point its OpenAI client at OpenRouter and use the chat
 * completions API. The parent's inherited resources (files + MCP servers) are
 * wired in as REAL callable tools (see resourceToolset), so the worker can
 * actually read those files and invoke those servers — not just be told they
 * exist. GPU seconds are estimated from output tokens + latency.
 *
 * The SDK call is behind an injectable executor so the runtime is unit-testable
 * without network/keys; the mock runtime remains the default for dev/test.
 */

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getModalRuntimeFromEnv } from "@/server/agents/modalAgentRuntime";
import { MockAgentRuntime } from "@/server/agents/mockAgentRuntime";
import {
  buildResourceTools,
  type McpTransport,
  type ResourceTool,
} from "@/server/agents/resourceToolset";
import type { AgentRunInput, AgentRunResult, AgentRuntime } from "@/server/agents/types";

export interface AgentExecution {
  text: string;
  outputTokens: number;
}

export type AgentExecutor = (params: {
  system: string;
  task: string;
  model: string;
  maxRuntimeMs: number;
  /** Real callable tools built from the parent's inherited resources. */
  tools: ResourceTool[];
}) => Promise<AgentExecution>;

let configured = false;

/** Default executor: OpenAI Agents SDK → OpenRouter (DeepSeek). */
async function openRouterExecutor(params: {
  system: string;
  task: string;
  model: string;
  maxRuntimeMs: number;
  tools: ResourceTool[];
}): Promise<AgentExecution> {
  const agents = await import("@openai/agents");
  const { OpenAI } = await import("openai");

  if (!configured) {
    const client = new OpenAI({
      baseURL: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
    });
    agents.setDefaultOpenAIClient(client as never);
    agents.setOpenAIAPI("chat_completions");
    agents.setTracingDisabled(true);
    configured = true;
  }

  // Wire the inherited resources in as REAL callable tools on the agent, so the
  // worker can actually read the parent's files and invoke its MCP servers.
  const sdkTools = params.tools.map((t) =>
    agents.tool({
      name: t.name,
      description: t.description,
      parameters: t.parameters as never,
      execute: async (args: unknown) => {
        const out = await t.execute((args ?? {}) as Record<string, unknown>);
        return typeof out === "string" ? out : JSON.stringify(out);
      },
    }),
  );

  const agent = new agents.Agent({
    name: "swarm-worker",
    instructions: params.system,
    model: params.model,
    tools: sdkTools,
  });

  // Hard wall-clock limit so a slow LLM cannot run forever and consume unbounded
  // GPU budget. Promise.race aborts the winning side immediately on resolution.
  const agentPromise = agents.run(agent, params.task, { maxTurns: 8 } as never);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT")), params.maxRuntimeMs),
  );
  const result = await Promise.race([agentPromise, timeoutPromise]);

  const out = (result as { finalOutput?: unknown }).finalOutput;
  const text = typeof out === "string" ? out : JSON.stringify(out ?? "");
  return { text, outputTokens: Math.max(1, Math.ceil(text.length / 4)) };
}

export class OpenRouterAgentRuntime implements AgentRuntime {
  readonly kind = "openrouter";

  constructor(
    private readonly executor: AgentExecutor = openRouterExecutor,
    private readonly mcpTransport?: McpTransport,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const start = Date.now();
    const tools = buildResourceTools(input.resources, { mcpTransport: this.mcpTransport });
    const toolNames = tools.map((t) => t.name);
    const system = [
      "You are a spawned worker agent doing a focused task for a parent agent.",
      input.resources.context ? `Context from the parent agent:\n${input.resources.context}` : "",
      toolNames.length
        ? `You can call these inherited tools to get what you need: ${toolNames.join(", ")}. Use them rather than guessing.`
        : "",
      "Do the task and return a concise, structured result.",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const { text, outputTokens } = await this.executor({
        system,
        task: input.task,
        model: input.model,
        maxRuntimeMs: input.maxRuntimeMs,
        tools,
      });
      const elapsedMs = Date.now() - start;
      const gpuSeconds = Math.max(1, Math.ceil(outputTokens / 50) + Math.round(elapsedMs / 1000));
      return {
        ok: true,
        gpuSeconds,
        result: { model: input.model, output: text, provider: "openrouter" },
        logs: [{ level: "info", message: `agent completed on ${input.model} via OpenRouter` }],
      };
    } catch (error) {
      logger.error("openrouter agent runtime failed", { model: input.model });
      return {
        ok: false,
        gpuSeconds: Math.max(1, Math.round((Date.now() - start) / 1000)),
        error: {
          code: "UPSTREAM_ERROR",
          message: error instanceof Error ? error.message : "agent call failed",
        },
        logs: [{ level: "error", message: "agent call failed" }],
      };
    }
  }
}

let runtime: AgentRuntime | undefined;

export function getAgentRuntime(): AgentRuntime {
  if (runtime) return runtime;
  if (env.AGENT_RUNTIME === "modal") {
    // The one production compute provider: the harness runs in a Modal sandbox.
    runtime = getModalRuntimeFromEnv();
    return runtime;
  }
  if (env.AGENT_RUNTIME === "openrouter") {
    if (!env.OPENROUTER_API_KEY) {
      // Fail closed rather than silently degrade to the mock.
      throw new Error("AGENT_RUNTIME=openrouter but OPENROUTER_API_KEY is unset");
    }
    runtime = new OpenRouterAgentRuntime();
    return runtime;
  }
  runtime = new MockAgentRuntime();
  return runtime;
}

/** Test seam. */
export function setAgentRuntime(next: AgentRuntime | undefined): void {
  runtime = next;
}
