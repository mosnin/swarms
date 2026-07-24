/**
 * Tests for GET /api/v1/agents/:id/stream (SSE wake console).
 *
 * A terminated agent's poll loop closes on the first iteration, so the whole
 * response body is consumable synchronously without real timers. Auth and
 * ownership guards return immediately too.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { __setTestDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { createTestDb, seedOrg, type TestDb } from "../integration/harness";
import { GET } from "@/app/api/v1/agents/[agentInstanceId]/stream/route";

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

function makeRequest(agentInstanceId: string, userId: string): NextRequest {
  return new NextRequest(`http://test.local/api/v1/agents/${agentInstanceId}/stream`, {
    method: "GET",
    headers: { [SESSION_USER_HEADER]: userId },
  });
}

async function seedAgent(db: TestDb, organizationId: string, status: string): Promise<string> {
  const [row] = await db
    .insert(schema.agentInstances)
    .values({
      organizationId,
      name: "Streamer",
      instructions: "watch",
      model: "mock",
      status: status as typeof schema.agentInstances.$inferInsert.status,
      budgetMinorPerWake: 100,
      currency: "USD",
    })
    .returning({ id: schema.agentInstances.id });
  return row!.id;
}

describe("GET /api/v1/agents/:id/stream", () => {
  let db: TestDb;
  let userId: string;
  let organizationId: string;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as never);
    ({ userId, organizationId } = await seedOrg(db, "org-agent-stream"));
  });

  afterEach(() => {
    __setTestDb(undefined);
  });

  it("returns 401 SSE error when unauthenticated", async () => {
    const req = new NextRequest("http://test.local/api/v1/agents/x/stream", { method: "GET" });
    const res = await GET(req, { params: Promise.resolve({ agentInstanceId: "x" }) });
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
  });

  it("returns 404 SSE error for an unknown agent", async () => {
    const req = makeRequest("agi_missing", userId);
    const res = await GET(req, { params: Promise.resolve({ agentInstanceId: "agi_missing" }) });
    expect(res.status).toBe(404);
    const events = parseSse(await res.text());
    expect(events[0]?.event).toBe("error");
  });

  it("streams a snapshot then closes for a terminated agent", async () => {
    const agentId = await seedAgent(db, organizationId, "terminated");
    const req = makeRequest(agentId, userId);
    const res = await GET(req, { params: Promise.resolve({ agentInstanceId: agentId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);

    const events = parseSse(await res.text());
    const types = events.map((e) => e.event);
    expect(types).toContain("agent.snapshot");
    expect(types).toContain("stream.closed");

    const snapshot = events.find((e) => e.event === "agent.snapshot")?.data as { id: string; status: string };
    expect(snapshot.id).toBe(agentId);
    expect(snapshot.status).toBe("terminated");
    const closed = events.find((e) => e.event === "stream.closed")?.data as { reason: string };
    expect(closed.reason).toBe("terminated");
  });
});
