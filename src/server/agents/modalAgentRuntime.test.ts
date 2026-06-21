import { describe, expect, it, vi } from "vitest";

import { ModalAgentRuntime, type ModalFetch } from "@/server/agents/modalAgentRuntime";
import type { AgentRunInput } from "@/server/agents/types";

const input: AgentRunInput = {
  jobId: "job_1",
  organizationId: "org_1",
  task: "Summarize the notes",
  resources: { files: { "notes.md": "hello" }, mcpServers: [{ name: "gh", url: "https://m" }] },
  model: "deepseek/deepseek-chat-v4",
  maxRuntimeMs: 5_000,
};

const cfg = { runUrl: "https://modal.example/run", token: "tok_secret" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("ModalAgentRuntime", () => {
  it("ships the run spec (with inherited resources + auth) to Modal and returns the result", async () => {
    const fetchImpl = vi.fn<ModalFetch>(async () =>
      jsonResponse({ output: { summary: "done" }, gpuSeconds: 12 }),
    );
    const out = await new ModalAgentRuntime(cfg, fetchImpl).run(input);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(cfg.runUrl);
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok_secret");
    const sent = JSON.parse(init?.body as string);
    expect(sent.task).toBe("Summarize the notes");
    expect(sent.resources.files["notes.md"]).toBe("hello"); // inherited resources travel to the sandbox

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.gpuSeconds).toBe(12);
      expect((out.result as { provider: string }).provider).toBe("modal");
      expect((out.result as { output: { summary: string } }).output.summary).toBe("done");
    }
  });

  it("retries a transient 5xx then succeeds", async () => {
    const fetchImpl = vi
      .fn<ModalFetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "bad gateway" }, 502))
      .mockResolvedValueOnce(jsonResponse({ output: "ok", gpuSeconds: 3 }));
    const out = await new ModalAgentRuntime(cfg, fetchImpl).run(input);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out.ok).toBe(true);
  });

  it("does not retry a 4xx and maps it to a structured error", async () => {
    const fetchImpl = vi.fn<ModalFetch>(async () => jsonResponse({ message: "nope" }, 400));
    const out = await new ModalAgentRuntime(cfg, fetchImpl).run(input);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("UPSTREAM_ERROR");
  });

  it("maps a malformed response to a structured error (no throw)", async () => {
    const fetchImpl = vi.fn<ModalFetch>(async () => jsonResponse({ not: "valid" }));
    const out = await new ModalAgentRuntime(cfg, fetchImpl).run(input);
    expect(out.ok).toBe(false);
  });

  it("surfaces a Modal-reported error", async () => {
    const fetchImpl = vi.fn<ModalFetch>(async () =>
      jsonResponse({ output: null, gpuSeconds: 1, error: { code: "TOOL_ERROR", message: "boom" } }),
    );
    const out = await new ModalAgentRuntime(cfg, fetchImpl).run(input);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.message).toBe("boom");
  });
});
