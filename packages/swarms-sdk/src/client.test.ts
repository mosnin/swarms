import { describe, expect, it, vi } from "vitest";

import { SwarmsClient } from "./client";
import { SwarmsError, SwarmsNetworkError } from "./errors";
import { budget, generateIdempotencyKey, toMinorUnits } from "./idempotency";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchImpl: typeof fetch) {
  return new SwarmsClient({
    baseUrl: "https://cloud.test/",
    apiKey: "hc_live_secret",
    fetch: fetchImpl,
  });
}

describe("SwarmsClient.spawnAgent", () => {
  it("posts to /spawn with bearer auth and returns the parsed response", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer hc_live_secret");
      return jsonResponse({
        data: {
          jobId: "job_1",
          status: "queued",
          model: "claude-haiku-4-5",
          maxGpuSeconds: 60,
          estimatedCostMinor: 120,
          currency: "USD",
          resources: { envKeys: ["TOKEN"], fileCount: 0, mcpServers: [], hasContext: true },
          executionUrl: "/api/v1/jobs/job_1",
          createdAt: "2026-01-01T00:00:00Z",
        },
      });
    });
    const res = await client(fetchMock as unknown as typeof fetch).spawnAgent({
      task: "Summarize the notes",
      resources: { env: { TOKEN: "x" }, context: "bg" },
      idempotencyKey: "idem-123456",
    });
    expect(res.jobId).toBe("job_1");
    expect(res.maxGpuSeconds).toBe(60);
    expect(res.resources.envKeys).toContain("TOKEN");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://cloud.test/api/v1/spawn");
  });

  it("maps a non-2xx response to a typed SwarmsError", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: "VALIDATION", message: "bad input", retryable: false } }, 400),
    );
    await expect(
      client(fetchMock as unknown as typeof fetch).spawnAgent({
        task: "x",
        idempotencyKey: "idem-123456",
      }),
    ).rejects.toBeInstanceOf(SwarmsError);
  });
});

describe("SwarmsClient.spawnSwarm", () => {
  it("posts tasks to /swarms and returns the parsed workforce response", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer hc_live_secret");
      const sent = JSON.parse(init?.body as string);
      expect(sent.tasks).toEqual(["a", "b"]);
      return jsonResponse({
        data: {
          swarmRunId: "swr_1",
          status: "succeeded",
          workerCount: 2,
          costMinor: 8,
          currency: "USD",
          maxGpuSecondsPerWorker: 2,
          workers: [
            { role: "worker-1", status: "succeeded", jobId: "job_a", costMinor: 4, output: {}, error: null },
            { role: "worker-2", status: "succeeded", jobId: "job_b", costMinor: 4, output: {}, error: null },
          ],
          createdAt: "2026-01-01T00:00:00Z",
        },
      }, 201);
    });
    const res = await client(fetchMock as unknown as typeof fetch).spawnSwarm({
      tasks: ["a", "b"],
      budgetMinor: 8,
      idempotencyKey: "idem-swarm-1",
    });
    expect(res.swarmRunId).toBe("swr_1");
    expect(res.workers).toHaveLength(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://cloud.test/api/v1/swarms");
  });
});

const AGENT_FIXTURE = {
  id: "agi_1",
  name: "Concierge",
  template: "hermes",
  instructions: "Answer briefly.",
  model: "mock",
  status: "active",
  wakeIntervalMinutes: 60,
  nextWakeAt: "2026-01-01T01:00:00Z",
  lastWakeAt: null,
  lastJobId: null,
  budgetMinorPerWake: 200,
  currency: "USD",
  stateVersion: 0,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("SwarmsClient hosted agents", () => {
  it("creates an agent via POST /api/v1/agents and returns the parsed instance", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const sent = JSON.parse(init?.body as string);
      expect(sent.name).toBe("Concierge");
      return jsonResponse({ data: { agent: AGENT_FIXTURE } }, 201);
    });
    const agent = await client(fetchMock as unknown as typeof fetch).createAgent({
      name: "Concierge",
      instructions: "Answer briefly.",
      budgetMinorPerWake: 200,
    });
    expect(agent.id).toBe("agi_1");
    expect(agent.budgetMinorPerWake).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://cloud.test/api/v1/agents");
  });

  it("lists agents", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { agents: [AGENT_FIXTURE] } }));
    const agents = await client(fetchMock as unknown as typeof fetch).listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]?.name).toBe("Concierge");
  });

  it("gets full agent detail (agent + thread + spend)", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        data: {
          agent: AGENT_FIXTURE,
          messages: [
            { id: "agm_1", role: "user", content: "hi", jobId: null, processedAt: null, createdAt: "2026-01-01T00:00:00Z" },
          ],
          spend: { totalSpendMinor: 42, wakeCount: 3, currency: "USD" },
        },
      }),
    );
    const detail = await client(fetchMock as unknown as typeof fetch).getAgent("agi_1");
    expect(detail.agent.id).toBe("agi_1");
    expect(detail.messages[0]?.content).toBe("hi");
    expect(detail.spend.totalSpendMinor).toBe(42);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://cloud.test/api/v1/agents/agi_1");
  });

  it("sends a message and returns the recorded row", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init?.body as string).content).toBe("do the thing");
      return jsonResponse(
        { data: { message: { id: "agm_9", role: "user", content: "do the thing", jobId: null, processedAt: null, createdAt: "2026-01-01T00:00:00Z" } } },
        202,
      );
    });
    const msg = await client(fetchMock as unknown as typeof fetch).sendAgentMessage("agi_1", "do the thing");
    expect(msg.id).toBe("agm_9");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://cloud.test/api/v1/agents/agi_1/messages");
  });

  it("paginates messages with limit + cursor in the query string", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        data: {
          messages: [
            { id: "agm_2", role: "agent", content: "reply", jobId: "job_1", processedAt: "2026-01-01T00:01:00Z", createdAt: "2026-01-01T00:01:00Z" },
          ],
          nextCursor: "Y3Vyc29y",
        },
      }),
    );
    const page = await client(fetchMock as unknown as typeof fetch).listAgentMessages("agi_1", {
      limit: 10,
      cursor: "abc",
    });
    expect(page.messages).toHaveLength(1);
    expect(page.nextCursor).toBe("Y3Vyc29y");
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/api/v1/agents/agi_1/messages?");
    expect(calledUrl).toContain("limit=10");
    expect(calledUrl).toContain("cursor=abc");
  });

  it("clones an agent via POST /clone", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init?.body as string).name).toBe("My Clone");
      return jsonResponse({ data: { agent: { ...AGENT_FIXTURE, id: "agi_2", name: "My Clone" } } }, 201);
    });
    const agent = await client(fetchMock as unknown as typeof fetch).cloneAgent("agi_1", "My Clone");
    expect(agent.id).toBe("agi_2");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://cloud.test/api/v1/agents/agi_1/clone");
  });

  it("terminates an agent via DELETE", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("DELETE");
      return jsonResponse({ data: { agentInstanceId: "agi_1", status: "terminated" } });
    });
    const res = await client(fetchMock as unknown as typeof fetch).terminateAgent("agi_1");
    expect(res.status).toBe("terminated");
  });
});

describe("transport safety", () => {
  it("wraps fetch failures and never includes the API key", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    try {
      await client(fetchMock as unknown as typeof fetch).getJob("job_1");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SwarmsNetworkError);
      expect((err as Error).message).not.toContain("hc_live_secret");
    }
  });
});

describe("helpers", () => {
  it("generates unique idempotency keys", () => {
    expect(generateIdempotencyKey()).not.toBe(generateIdempotencyKey());
  });
  it("converts major units to integer minor units", () => {
    expect(toMinorUnits(1.23)).toBe(123);
    expect(toMinorUnits(10)).toBe(1000);
  });
  it("builds a validated budget", () => {
    expect(budget(500)).toEqual({ budgetMinor: 500, currency: "USD" });
    expect(() => budget(-1)).toThrow();
  });
});
