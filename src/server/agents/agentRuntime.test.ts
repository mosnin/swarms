import { describe, expect, it, vi } from "vitest";

import { AnthropicAgentRuntime } from "@/server/agents/anthropicAgentRuntime";
import { MockAgentRuntime } from "@/server/agents/mockAgentRuntime";
import type { AgentRunInput } from "@/server/agents/types";

const input: AgentRunInput = {
  jobId: "job_1",
  organizationId: "org_1",
  task: "Summarize the notes",
  resources: { env: { TOKEN: "x" }, context: "bg", mcpServers: [{ name: "notion", url: "https://m" }] },
  model: "claude-haiku-4-5",
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

describe("AnthropicAgentRuntime", () => {
  it("calls the model with the inherited context as system prompt and returns text", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "done" }], usage: { output_tokens: 100 } }),
        { status: 200 },
      );
    });
    const rt = new AnthropicAgentRuntime("key", "https://api.test", fetchMock as unknown as typeof fetch);
    const out = await rt.run(input);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect((out.result as { output: string }).output).toBe("done");
      expect(out.gpuSeconds).toBeGreaterThan(0);
    }
    expect(String((capturedBody as unknown as { system?: string })?.system)).toContain("bg");
  });

  it("maps an upstream error to a structured failure (no throw)", async () => {
    const fetchMock = vi.fn(async () => new Response("err", { status: 500 }));
    const rt = new AnthropicAgentRuntime("key", "https://api.test", fetchMock as unknown as typeof fetch);
    const out = await rt.run(input);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("UPSTREAM_ERROR");
  });
});
