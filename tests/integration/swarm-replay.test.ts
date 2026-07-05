/**
 * Integration tests for POST /api/v1/swarms/:id/replay.
 *
 * We call the route handler directly with the dev SESSION_USER_HEADER so
 * authenticateRequest resolves without a real API key.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import { claimAndProcessJobs } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { POST } from "@/app/api/v1/swarms/[swarmRunId]/replay/route";

/** Drain the DB-backed queue (director job → fleet) until nothing is left. */
async function runWorker(db: TestDb): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const processed = await claimAndProcessJobs(db, 10);
    if (processed === 0) break;
  }
}

function makeReplayRequest(swarmRunId: string, userId: string, overrides: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(`http://test.local/api/v1/swarms/${swarmRunId}/replay`, {
    method: "POST",
    headers: { "content-type": "application/json", [SESSION_USER_HEADER]: userId },
    body: JSON.stringify(overrides),
  });
}

describe("integration: POST /api/v1/swarms/:id/replay", () => {
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

  it("replays a completed swarm and returns a new swarmRunId with replayedFrom", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-replay-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // Spawn an original swarm so agent rows exist with input.task set.
    const original = await spawnSwarm(
      ctx,
      {
        tasks: ["Research topic A", "Draft summary B"],
        budgetMinor: 200,
        idempotencyKey: "replay-origin-1",
      },
      db,
    );
    expect(original.status).toBe("succeeded");

    // Replay it.
    const req = makeReplayRequest(original.swarmRunId, userId);
    const res = await POST(req as never, { params: Promise.resolve({ swarmRunId: original.swarmRunId }) });

    // Async: the replay is accepted (202) and queued; the fleet runs on the worker.
    expect(res.status).toBe(202);
    const body = await res.json() as { data: { swarmRunId: string; replayedFrom: string; status: string; workerCount: number } };
    expect(body.data.replayedFrom).toBe(original.swarmRunId);
    expect(body.data.swarmRunId).not.toBe(original.swarmRunId);
    expect(body.data.status).toBe("queued");
    expect(body.data.workerCount).toBe(2);

    // Drive the worker: the director job executes the fleet into the queued run.
    await runWorker(db);
    const [replayed] = await db
      .select()
      .from(schema.swarmRuns)
      .where(eq(schema.swarmRuns.id, body.data.swarmRunId));
    expect(replayed?.status).toBe("succeeded");

    // Verify both runs exist in DB.
    const allRuns = await db.select().from(schema.swarmRuns).where(eq(schema.swarmRuns.organizationId, organizationId));
    expect(allRuns.length).toBeGreaterThanOrEqual(2);
  });

  it("carries original task count into the replayed swarm workers", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-replay-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const original = await spawnSwarm(
      ctx,
      {
        tasks: ["task X", "task Y", "task Z"],
        budgetMinor: 300,
        idempotencyKey: "replay-origin-2",
      },
      db,
    );

    const req = makeReplayRequest(original.swarmRunId, userId);
    const res = await POST(req as never, { params: Promise.resolve({ swarmRunId: original.swarmRunId }) });

    expect(res.status).toBe(202);
    const body = await res.json() as { data: { workerCount: number } };
    expect(body.data.workerCount).toBe(3);
  });

  it("accepts budget override in replay body", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-replay-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const original = await spawnSwarm(
      ctx,
      { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "replay-origin-3" },
      db,
    );

    const req = makeReplayRequest(original.swarmRunId, userId, { budgetMinor: 200 });
    const res = await POST(req as never, { params: Promise.resolve({ swarmRunId: original.swarmRunId }) });

    expect(res.status).toBe(202);
    const body = await res.json() as { data: { status: string; swarmRunId: string } };
    expect(body.data.status).toBe("queued");
    await runWorker(db);
    const [replayed] = await db
      .select()
      .from(schema.swarmRuns)
      .where(eq(schema.swarmRuns.id, body.data.swarmRunId));
    expect(replayed?.status).toBe("succeeded");
  });

  it("uses a fresh idempotency key so the same replay can be called again", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-replay-4");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const original = await spawnSwarm(
      ctx,
      { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "replay-origin-4" },
      db,
    );

    // Two replay calls with different replayTag values must both succeed.
    const res1 = await POST(
      makeReplayRequest(original.swarmRunId, userId, { replayTag: "run-1" }) as never,
      { params: Promise.resolve({ swarmRunId: original.swarmRunId }) },
    );
    const res2 = await POST(
      makeReplayRequest(original.swarmRunId, userId, { replayTag: "run-2" }) as never,
      { params: Promise.resolve({ swarmRunId: original.swarmRunId }) },
    );

    expect(res1.status).toBe(202);
    expect(res2.status).toBe(202);
    const b1 = await res1.json() as { data: { swarmRunId: string } };
    const b2 = await res2.json() as { data: { swarmRunId: string } };
    expect(b1.data.swarmRunId).not.toBe(b2.data.swarmRunId);
  });

  it("returns 404 when the original swarm run does not exist", async () => {
    const { userId } = await seedOrg(db, "org-replay-5");

    const req = makeReplayRequest("nonexistent-run-id", userId);
    const res = await POST(req as never, { params: Promise.resolve({ swarmRunId: "nonexistent-run-id" }) });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 when original swarm has no recoverable tasks", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-replay-6");

    // Insert a run with no agent rows.
    const [run] = await db
      .insert(schema.swarmRuns)
      .values({
        organizationId,
        idempotencyKey: "replay-no-tasks",
        status: "succeeded",
        input: {},
        costCurrency: "USD",
      })
      .returning();
    if (!run) throw new Error("Failed to insert run");

    const req = makeReplayRequest(run.id, userId);
    const res = await POST(req as never, { params: Promise.resolve({ swarmRunId: run.id }) });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION");
  });
});
