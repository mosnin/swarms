/**
 * Tests for GET /api/v1/swarms/:id/stream (SSE).
 *
 * For completed swarms the poll loop terminates immediately, so we can consume
 * the entire response body synchronously in tests without real timers.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { __setTestDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { createTestDb, seedOrg, type TestDb } from "../integration/harness";
import { GET } from "@/app/api/v1/swarms/[swarmRunId]/stream/route";

/** Parse a raw SSE text body into a list of {event, data} objects. */
function parseSse(text: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = text.split("\n\n").filter((b) => b.trim() && !b.startsWith(":"));
  for (const block of blocks) {
    let event = "message";
    let dataStr = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
    }
    if (dataStr) {
      try {
        events.push({ event, data: JSON.parse(dataStr) });
      } catch {
        events.push({ event, data: dataStr });
      }
    }
  }
  return events;
}

function makeRequest(swarmRunId: string, userId: string): NextRequest {
  return new NextRequest(`http://test.local/api/v1/swarms/${swarmRunId}/stream`, {
    method: "GET",
    headers: { [SESSION_USER_HEADER]: userId },
  });
}

describe("GET /api/v1/swarms/:id/stream", () => {
  let db: TestDb;
  let userId: string;
  let organizationId: string;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as never);
    ({ userId, organizationId } = await seedOrg(db, "org-stream"));
  });

  afterEach(() => {
    __setTestDb(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const req = new NextRequest("http://test.local/api/v1/swarms/x/stream", { method: "GET" });
    const res = await GET(req, { params: Promise.resolve({ swarmRunId: "x" }) });
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
  });

  it("returns 404 SSE error for unknown swarm run", async () => {
    const req = makeRequest("nonexistent-id", userId);
    const res = await GET(req, { params: Promise.resolve({ swarmRunId: "nonexistent-id" }) });
    expect(res.status).toBe(404);
    const text = await res.text();
    const events = parseSse(text);
    expect(events[0]?.event).toBe("error");
    expect((events[0]?.data as { code: string }).code).toBe("NOT_FOUND");
  });

  it("streams swarm.started + swarm.done for a completed run with no agents", async () => {
    const [run] = await db
      .insert(schema.swarmRuns)
      .values({
        organizationId,
        idempotencyKey: "stream-test-1",
        status: "succeeded",
        input: {},
        costCurrency: "USD",
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();
    if (!run) throw new Error("Failed to create run");

    const req = makeRequest(run.id, userId);
    const res = await GET(req, { params: Promise.resolve({ swarmRunId: run.id }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);

    const text = await res.text();
    const events = parseSse(text);

    expect(events[0]?.event).toBe("swarm.started");
    expect((events[0]?.data as { swarmRunId: string }).swarmRunId).toBe(run.id);

    const done = events.find((e) => e.event === "swarm.done");
    expect(done).toBeDefined();
    expect((done!.data as { status: string }).status).toBe("succeeded");
  });

  it("emits worker.update for each terminal agent before swarm.done", async () => {
    const [run] = await db
      .insert(schema.swarmRuns)
      .values({
        organizationId,
        idempotencyKey: "stream-test-2",
        status: "succeeded",
        input: {},
        costCurrency: "USD",
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();
    if (!run) throw new Error("Failed to create run");

    await db.insert(schema.swarmAgents).values([
      { organizationId, swarmRunId: run.id, role: "worker-0", status: "succeeded", costCurrency: "USD", output: { result: "A" } },
      { organizationId, swarmRunId: run.id, role: "worker-1", status: "failed", costCurrency: "USD", error: { message: "oops" } },
    ]);

    const req = makeRequest(run.id, userId);
    const res = await GET(req, { params: Promise.resolve({ swarmRunId: run.id }) });

    const text = await res.text();
    const events = parseSse(text);

    const updates = events.filter((e) => e.event === "worker.update");
    expect(updates).toHaveLength(2);

    const roles = updates.map((e) => (e.data as { role: string }).role).sort();
    expect(roles).toEqual(["worker-0", "worker-1"]);

    const done = events.find((e) => e.event === "swarm.done");
    expect(done).toBeDefined();
    expect((done!.data as { totalWorkers: number }).totalWorkers).toBe(2);
    expect((done!.data as { finishedWorkers: number }).finishedWorkers).toBe(2);
  });

  it("emits swarm.done with cancelled status when run is cancelled", async () => {
    const [run] = await db
      .insert(schema.swarmRuns)
      .values({
        organizationId,
        idempotencyKey: "stream-test-3",
        status: "cancelled",
        input: {},
        costCurrency: "USD",
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();
    if (!run) throw new Error("Failed to create run");

    const req = makeRequest(run.id, userId);
    const res = await GET(req, { params: Promise.resolve({ swarmRunId: run.id }) });

    const text = await res.text();
    const events = parseSse(text);

    const done = events.find((e) => e.event === "swarm.done");
    expect(done).toBeDefined();
    expect((done!.data as { status: string }).status).toBe("cancelled");
  });
});
