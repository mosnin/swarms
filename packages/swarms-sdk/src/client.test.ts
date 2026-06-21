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

describe("SwarmsClient.executePaidSkill", () => {
  const params = { skillSlug: "premium", input: {}, idempotencyKey: "idem-pay-123" };
  const requirements = {
    scheme: "x402-mock",
    network: "base-sepolia",
    payTo: "0xPAY",
    amountMinor: 500,
    currency: "USD",
    nonce: "n1",
    binding: "b1",
    expiresAt: "2026-01-01T00:05:00Z",
  };

  it("returns payment requirements on 402 when no signer is provided", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { code: "PAYMENT_REQUIRED", message: "pay" }, accepts: [requirements] }, 402));
    const result = await client(fetchMock as unknown as typeof fetch).executePaidSkill(params);
    expect(result.kind).toBe("payment_required");
    if (result.kind === "payment_required") expect(result.requirements.amountMinor).toBe(500);
  });

  it("signs and retries with the X-PAYMENT header when a signer is provided", async () => {
    let call = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        return jsonResponse({ error: { code: "PAYMENT_REQUIRED", message: "pay" }, accepts: [requirements] }, 402);
      }
      expect((init?.headers as Record<string, string>)["x-payment"]).toBe("signed-proof");
      return jsonResponse({
        data: {
          jobId: "job_paid",
          status: "queued",
          paymentRequired: false,
          estimatedCostMinor: 500,
          currency: "USD",
          executionUrl: "/api/v1/jobs/job_paid",
          createdAt: "2026-01-01T00:00:00Z",
        },
      }, 201);
    });
    const signer = { sign: async () => "signed-proof" };
    const result = await client(fetchMock as unknown as typeof fetch).executePaidSkill(params, { signer });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.response.jobId).toBe("job_paid");
    expect(call).toBe(2);
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
