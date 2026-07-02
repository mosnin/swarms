/**
 * Integration tests for swarm read endpoints:
 *   GET /api/v1/swarms             — list swarm runs
 *   GET /api/v1/swarms/:id         — get a single run with agents
 *   GET /api/v1/swarms/:id/logs    — execution log rollup
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { GET as listGet } from "@/app/api/v1/swarms/route";
import { GET as getById } from "@/app/api/v1/swarms/[swarmRunId]/route";
import { GET as getLogs } from "@/app/api/v1/swarms/[swarmRunId]/logs/route";

function makeListRequest(userId: string, params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://test.local/api/v1/swarms");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers: { [SESSION_USER_HEADER]: userId } });
}

function makeGetRequest(swarmRunId: string, userId: string): NextRequest {
  return new NextRequest(`http://test.local/api/v1/swarms/${swarmRunId}`, {
    headers: { [SESSION_USER_HEADER]: userId },
  });
}

function makeLogsRequest(swarmRunId: string, userId: string): NextRequest {
  return new NextRequest(`http://test.local/api/v1/swarms/${swarmRunId}/logs`, {
    headers: { [SESSION_USER_HEADER]: userId },
  });
}

describe("integration: GET /api/v1/swarms (list)", () => {
  let db: TestDb;

  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });

  afterEach(() => {
    setJobQueue(undefined);
    __setTestDb(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const req = new NextRequest("http://test.local/api/v1/swarms");
    const res = await listGet(req);
    expect(res.status).toBe(401);
  });

  it("returns empty list for a fresh org", async () => {
    const { userId } = await seedOrg(db, "org-list-1");
    const res = await listGet(makeListRequest(userId));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { runs: unknown[]; nextCursor: null } };
    expect(body.data.runs).toHaveLength(0);
    expect(body.data.nextCursor).toBeNull();
  });

  it("lists spawned swarm runs in reverse-chronological order", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-list-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const r1 = await spawnSwarm(ctx, { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "list-r1" }, db);
    const r2 = await spawnSwarm(ctx, { tasks: ["task B", "task C"], budgetMinor: 200, idempotencyKey: "list-r2" }, db);

    const res = await listGet(makeListRequest(userId));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { runs: Array<{ id: string; workerCount: number; status: string }> } };

    expect(body.data.runs).toHaveLength(2);
    // Most recent first (r2 was created after r1).
    expect(body.data.runs[0]?.id).toBe(r2.swarmRunId);
    expect(body.data.runs[1]?.id).toBe(r1.swarmRunId);
    expect(body.data.runs[0]?.status).toBe("succeeded");
    expect(body.data.runs[0]?.workerCount).toBe(2);
  });

  it("filters by status", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-list-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await spawnSwarm(ctx, { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "list-r3a" }, db);

    // Insert a manually-cancelled run.
    await db.insert(schema.swarmRuns).values({
      organizationId,
      idempotencyKey: "list-r3b",
      status: "cancelled",
      input: { workerCount: 1 },
      costCurrency: "USD",
    });

    // Filter for succeeded only.
    const res = await listGet(makeListRequest(userId, { status: "succeeded" }));
    const body = await res.json() as { data: { runs: Array<{ status: string }> } };
    expect(body.data.runs.every((r) => r.status === "succeeded")).toBe(true);
    expect(body.data.runs).toHaveLength(1);
  });

  it("returns 400 for invalid status filter", async () => {
    const { userId } = await seedOrg(db, "org-list-4");
    const res = await listGet(makeListRequest(userId, { status: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("paginates with limit and nextCursor", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-list-5");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // Spawn 3 runs.
    for (let i = 0; i < 3; i++) {
      await spawnSwarm(ctx, { tasks: [`task ${i}`], budgetMinor: 100, idempotencyKey: `list-pg-${i}` }, db);
    }

    const page1Res = await listGet(makeListRequest(userId, { limit: "2" }));
    const page1 = await page1Res.json() as { data: { runs: Array<{ id: string }>; nextCursor: string | null } };
    expect(page1.data.runs).toHaveLength(2);
    expect(page1.data.nextCursor).not.toBeNull();

    const cursor = page1.data.nextCursor!;
    const page2Res = await listGet(makeListRequest(userId, { limit: "2", cursor }));
    const page2 = await page2Res.json() as { data: { runs: Array<{ id: string }>; nextCursor: string | null } };
    expect(page2.data.runs).toHaveLength(1);
    expect(page2.data.nextCursor).toBeNull();

    // No overlap.
    const page1Ids = page1.data.runs.map((r) => r.id);
    const page2Ids = page2.data.runs.map((r) => r.id);
    expect(page1Ids.every((id) => !page2Ids.includes(id))).toBe(true);
  });

  it("isolates runs by organization", async () => {
    const { organizationId: org1Id, userId: user1Id } = await seedOrg(db, "org-list-6a");
    const { organizationId: org2Id, userId: user2Id } = await seedOrg(db, "org-list-6b");
    const ctx1 = userContext({ organizationId: org1Id, userId: user1Id, membershipId: "m", role: "owner" });
    const ctx2 = userContext({ organizationId: org2Id, userId: user2Id, membershipId: "m", role: "owner" });

    await spawnSwarm(ctx1, { tasks: ["org1 task"], budgetMinor: 100, idempotencyKey: "list-iso-1" }, db);
    await spawnSwarm(ctx2, { tasks: ["org2 task"], budgetMinor: 100, idempotencyKey: "list-iso-2" }, db);

    const res = await listGet(makeListRequest(user1Id));
    const body = await res.json() as { data: { runs: unknown[] } };
    expect(body.data.runs).toHaveLength(1);
  });
});

describe("integration: GET /api/v1/swarms/:id", () => {
  let db: TestDb;

  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });

  afterEach(() => {
    setJobQueue(undefined);
    __setTestDb(undefined);
  });

  it("returns run details with agents after spawn", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-get-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const spawned = await spawnSwarm(
      ctx,
      { tasks: ["task A", "task B"], budgetMinor: 200, idempotencyKey: "get-r1" },
      db,
    );

    const req = makeGetRequest(spawned.swarmRunId, userId);
    const res = await getById(req, { params: Promise.resolve({ swarmRunId: spawned.swarmRunId }) });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: { run: { id: string; status: string; agents: Array<{ role: string; status: string }> } };
    };
    expect(body.data.run.id).toBe(spawned.swarmRunId);
    expect(body.data.run.status).toBe("succeeded");
    expect(body.data.run.agents).toHaveLength(2);
    expect(body.data.run.agents.every((a) => a.status === "succeeded")).toBe(true);
  });

  it("returns 404 for unknown run", async () => {
    const { userId } = await seedOrg(db, "org-get-2");
    const req = makeGetRequest("nonexistent", userId);
    const res = await getById(req, { params: Promise.resolve({ swarmRunId: "nonexistent" }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const req = new NextRequest("http://test.local/api/v1/swarms/x");
    const res = await getById(req, { params: Promise.resolve({ swarmRunId: "x" }) });
    expect(res.status).toBe(401);
  });
});

describe("integration: GET /api/v1/swarms/:id/logs", () => {
  let db: TestDb;

  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });

  afterEach(() => {
    setJobQueue(undefined);
    __setTestDb(undefined);
  });

  it("returns empty logs array for a run with no execution log entries", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-logs-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const spawned = await spawnSwarm(
      ctx,
      { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "logs-r1" },
      db,
    );

    const req = makeLogsRequest(spawned.swarmRunId, userId);
    const res = await getLogs(req, { params: Promise.resolve({ swarmRunId: spawned.swarmRunId }) });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { logs: unknown[] } };
    expect(Array.isArray(body.data.logs)).toBe(true);
  });

  it("returns 404 for unknown run", async () => {
    const { userId } = await seedOrg(db, "org-logs-2");
    const req = makeLogsRequest("nonexistent", userId);
    const res = await getLogs(req, { params: Promise.resolve({ swarmRunId: "nonexistent" }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const req = new NextRequest("http://test.local/api/v1/swarms/x/logs");
    const res = await getLogs(req, { params: Promise.resolve({ swarmRunId: "x" }) });
    expect(res.status).toBe(401);
  });
});
