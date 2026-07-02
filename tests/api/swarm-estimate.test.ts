/**
 * Unit-style tests for POST /api/v1/swarms/estimate.
 *
 * We call the route handler directly (no HTTP server) using the dev session
 * header so authenticateRequest resolves without a real API key.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { __setTestDb } from "@/lib/db";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { createTestDb, seedOrg, type TestDb } from "../integration/harness";
import { POST } from "@/app/api/v1/swarms/estimate/route";

function makeRequest(body: unknown, userId: string): NextRequest {
  return new NextRequest("http://test.local/api/v1/swarms/estimate", {
    method: "POST",
    headers: { "content-type": "application/json", [SESSION_USER_HEADER]: userId },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/swarms/estimate", () => {
  let db: TestDb;
  let userId: string;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as never);
    ({ userId } = await seedOrg(db, "org-estimate"));
  });

  afterEach(() => {
    __setTestDb(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const req = new NextRequest("http://test.local/api/v1/swarms/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tasks: ["task A"] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty tasks array", async () => {
    const res = await POST(makeRequest({ tasks: [] }, userId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
  });

  it("returns 400 when budgetUsd and budgetMinor are both provided", async () => {
    const res = await POST(makeRequest({ tasks: ["task A"], budgetUsd: 1.0, budgetMinor: 100 }, userId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
  });

  it("returns cost breakdown for tasks with budgetMinor", async () => {
    const res = await POST(makeRequest({ tasks: ["task A", "task B"], budgetMinor: 200, currency: "USD" }, userId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.agentSlots).toBe(2);
    expect(body.data.workerCount).toBe(2);
    expect(body.data.hasAggregator).toBe(false);
    expect(body.data.perWorkerMinor).toBe(100); // 200 / 2
    expect(body.data.estimatedCostMinor).toBe(200);
    expect(body.data.currency).toBe("USD");
    expect(typeof body.data.maxGpuSecondsPerWorker).toBe("number");
    expect(body.data.maxGpuSecondsPerWorker).toBeGreaterThan(0);
    expect(typeof body.data.rateMinorPerSecond).toBe("number");
    expect(typeof body.data.withinBudget).toBe("boolean");
  });

  it("accounts for aggregator slot when aggregatorTask is provided", async () => {
    const res = await POST(
      makeRequest(
        { tasks: ["task A", "task B"], aggregatorTask: "Synthesize", budgetMinor: 300, currency: "USD" },
        userId,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.agentSlots).toBe(3); // 2 workers + 1 aggregator
    expect(body.data.workerCount).toBe(2);
    expect(body.data.hasAggregator).toBe(true);
    expect(body.data.perWorkerMinor).toBe(100); // 300 / 3
    expect(body.data.estimatedCostMinor).toBe(300);
  });

  it("accepts budgetUsd and converts to minor units for display", async () => {
    const res = await POST(makeRequest({ tasks: ["task A"], budgetUsd: 1.0 }, userId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.estimatedCostMinor).toBeGreaterThan(0);
    expect(body.data.estimatedCostUsd).toBeTypeOf("number");
    expect(body.data.currency).toBe("USD");
  });

  it("returns withinBudget=false and rejectionReason when budget is too low", async () => {
    // GPU rate default is 2 minor/sec; 1 slot needs at least 2 minor to run for 1s
    // passing 1 minor for 1 task → perWorkerMinor=1 < rate=2 → withinBudget=false
    const res = await POST(makeRequest({ tasks: ["task A"], budgetMinor: 1, currency: "USD" }, userId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.withinBudget).toBe(false);
    expect(body.data.rejectionReason).toMatch(/too low/i);
  });

  it("returns sensible defaults when no budget is provided", async () => {
    const res = await POST(makeRequest({ tasks: ["task A"] }, userId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.withinBudget).toBe(true);
    expect(body.data.estimatedCostMinor).toBeGreaterThan(0);
  });
});
