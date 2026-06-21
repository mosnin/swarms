import { describe, expect, it, vi } from "vitest";

import { MockAgentRuntime } from "@/server/agents/mockAgentRuntime";
import { OpenRouterAgentRuntime, type AgentExecutor } from "@/server/agents/openrouterAgentRuntime";
import type { AgentRunInput } from "@/server/agents/types";

const input: AgentRunInput = {
  jobId: "job_1",
  organizationId: "org_1",
  task: "Summarize the notes",
  resources: { env: { TOKEN: "x" }, context: "bg", mcpServers: [{ name: "notion", url: "https://m" }] },
  model: "deepseek/deepseek-chat-v4",
  maxRuntimeMs: 5000,
};

describe("MockAgentRuntime", () => {
  it("reports inherited resources and meters GPU deterministically", async () => {
    const out = await new MockAgentRuntime().run(input);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.gpuSeconds).toBeGreaterThan(0);
      expect((out.result as { inheritedResources: { mcpServers: string[] } }).inheritedResources.mcpServers).toEqual([
        "notion",
      ]);
    }
  });
});

describe("OpenRouterAgentRuntime (OpenAI Agents SDK → DeepSeek via OpenRouter)", () => {
  it("passes the inherited context as instructions, runs the model, meters GPU", async () => {
    let captured: { system: string; task: string; model: string } | null = null;
    const executor: AgentExecutor = async (p) => {
      captured = { system: p.system, task: p.task, model: p.model };
      return { text: "done", outputTokens: 100 };
    };
    const out = await new OpenRouterAgentRuntime(executor).run(input);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect((out.result as { output: string; provider: string }).output).toBe("done");
      expect((out.result as { provider: string }).provider).toBe("openrouter");
      expect(out.gpuSeconds).toBeGreaterThan(0);
    }
    expect(captured!.model).toBe("deepseek/deepseek-chat-v4");
    expect(captured!.system).toContain("bg"); // inherited context
    expect(captured!.system).toContain("notion"); // inherited tool
  });

  it("maps an executor failure to a structured result (no throw)", async () => {
    const executor: AgentExecutor = vi.fn(async () => {
      throw new Error("openrouter 429");
    });
    const out = await new OpenRouterAgentRuntime(executor).run(input);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.message).toContain("429");
  });

  it("gives the worker REAL callable tools for inherited files and MCP servers", async () => {
    const withFiles: AgentRunInput = {
      ...input,
      resources: {
        ...input.resources,
        files: { "spec.md": "build the thing" },
      },
    };
    // A stub MCP transport standing in for the inherited server.
    const mcpTransport = async () => ({ ok: true as const, content: { answer: 42 } });

    // Fake executor that behaves like the agent loop: it actually invokes the
    // tools it was handed (read_file + the inherited MCP server) and folds their
    // real outputs into its final answer. This proves inheritance is callable,
    // not just described.
    const executor: AgentExecutor = async (p) => {
      const readFile = p.tools.find((t) => t.name === "read_file")!;
      const mcp = p.tools.find((t) => t.name === "mcp_notion")!;
      const file = (await readFile.execute({ path: "spec.md" })) as { contents: string };
      const remote = (await mcp.execute({ tool: "compute", arguments: {} })) as { answer: number };
      return { text: `${file.contents}:${remote.answer}`, outputTokens: 50 };
    };

    const out = await new OpenRouterAgentRuntime(executor, mcpTransport).run(withFiles);
    expect(out.ok).toBe(true);
    if (out.ok) {
      // The agent's answer contains data only obtainable by actually calling the
      // inherited file tool and the inherited MCP server.
      expect((out.result as { output: string }).output).toBe("build the thing:42");
    }
  });
});
