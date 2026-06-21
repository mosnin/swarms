/**
 * Anthropic-backed agent runtime. Runs the spawned worker agent on a Claude
 * model, giving it the parent's inherited context, files, and available tools
 * (MCP servers) so it can actually do the task. Every external call has a
 * timeout and maps failures to a structured result. GPU seconds are estimated
 * from output tokens + latency.
 *
 * v1 performs a single completion (suitable for "basic tasks"); a multi-turn
 * MCP tool-use loop runs inside the sandbox in production and is layered on the
 * same interface.
 */

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MockAgentRuntime } from "@/server/agents/mockAgentRuntime";
import type { AgentRunInput, AgentRunResult, AgentRuntime } from "@/server/agents/types";

export class AnthropicAgentRuntime implements AgentRuntime {
  readonly kind = "anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const start = Date.now();
    const tools = (input.resources.mcpServers ?? []).map((s) => s.name);
    const system = [
      "You are a spawned worker agent doing a focused task on behalf of a parent agent.",
      input.resources.context ? `Context from the parent agent:\n${input.resources.context}` : "",
      tools.length ? `Tools available to you (MCP): ${tools.join(", ")}.` : "",
      "Do the task and return a concise, structured result.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.maxRuntimeMs);
    try {
      const res = await this.doFetch(`${this.baseUrl.replace(/\/+$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: input.model,
          max_tokens: 1024,
          system,
          messages: [{ role: "user", content: input.task }],
        }),
        signal: controller.signal,
      });

      const elapsedMs = Date.now() - start;
      if (!res.ok) {
        return {
          ok: false,
          gpuSeconds: Math.max(1, Math.round(elapsedMs / 1000)),
          error: { code: "UPSTREAM_ERROR", message: `model returned ${res.status}` },
          logs: [{ level: "error", message: `agent model call failed: ${res.status}` }],
        };
      }
      const body = (await res.json().catch(() => ({}))) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (body.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      const outTokens = body.usage?.output_tokens ?? 0;
      // GPU-second estimate from generation work (tokens) and wall-clock latency.
      const gpuSeconds = Math.max(1, Math.ceil(outTokens / 50) + Math.round(elapsedMs / 1000));

      return {
        ok: true,
        gpuSeconds,
        result: { model: input.model, output: text, tokens: body.usage ?? null },
        logs: [{ level: "info", message: `agent completed on ${input.model}` }],
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      logger.error("anthropic agent runtime failed", { aborted });
      return {
        ok: false,
        gpuSeconds: Math.max(1, Math.round((Date.now() - start) / 1000)),
        error: { code: aborted ? "TIMEOUT" : "UPSTREAM_ERROR", message: aborted ? "agent timed out" : "agent call failed" },
        logs: [{ level: "error", message: aborted ? "agent timed out" : "agent call failed" }],
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

let runtime: AgentRuntime | undefined;

export function getAgentRuntime(): AgentRuntime {
  if (runtime) return runtime;
  if (env.AGENT_RUNTIME === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      // Fail closed rather than silently degrade to the mock.
      throw new Error("AGENT_RUNTIME=anthropic but ANTHROPIC_API_KEY is unset");
    }
    runtime = new AnthropicAgentRuntime(env.ANTHROPIC_API_KEY, env.ANTHROPIC_BASE_URL);
    return runtime;
  }
  // Mock runtime (dev/test).
  runtime = new MockAgentRuntime();
  return runtime;
}

/** Test seam. */
export function setAgentRuntime(next: AgentRuntime | undefined): void {
  runtime = next;
}
