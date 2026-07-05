/**
 * Integration: POST /api/v1/swarms is async. The request enqueues the swarm
 * (creates the run + a director job) and returns 202 with status "queued" —
 * the agent fleet never runs inside the request handler. The worker then drains
 * the director job, which executes the fleet into the pre-created run.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { claimAndProcessJobs } from "@/modules/execution/worker";
import { cancelSwarm } from "@/modules/swarms/cancel-swarm";
import { userContext } from "@/modules/identity/access-control";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { POST } from "@/app/api/v1/swarms/route";

function spawnReq(userId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://test.local/api/v1/swarms", {
    method: "POST",
    headers: { "content-type": "application/json", [SESSION_USER_HEADER]: userId },
    body: JSON.stringify(body),
  });
}

async function runWorker(db: TestDb): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if ((await claimAndProcessJobs(db, 10)) === 0) break;
  }
}

describe("integration: POST /api/v1/swarms (async)", () => {
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

  it("returns 202 queued immediately, then the worker completes the run", async () => {
    const { userId } = await seedOrg(db, "org-async-1");

    const res = await POST(
      spawnReq(userId, {
        tasks: ["Research A", "Draft B"],
        budgetMinor: 400,
        idempotencyKey: "async-run-0001",
      }) as never,
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { data: { swarmRunId: string; status: string; workerCount: number } };
    expect(body.data.status).toBe("queued");
    expect(body.data.workerCount).toBe(2);

    // No worker rows have executed yet — the fleet did NOT run in the request.
    const before = await db
      .select()
      .from(schema.swarmAgents)
      .where(eq(schema.swarmAgents.swarmRunId, body.data.swarmRunId));
    expect(before.length).toBe(0);

    await runWorker(db);

    const [run] = await db
      .select()
      .from(schema.swarmRuns)
      .where(eq(schema.swarmRuns.id, body.data.swarmRunId));
    expect(run?.status).toBe("succeeded");
    const after = await db
      .select()
      .from(schema.swarmAgents)
      .where(eq(schema.swarmAgents.swarmRunId, body.data.swarmRunId));
    expect(after.length).toBe(2);
  });

  it("is idempotent: replaying the key returns the same run", async () => {
    const { userId } = await seedOrg(db, "org-async-2");
    const make = () => spawnReq(userId, { tasks: ["X"], budgetMinor: 200, idempotencyKey: "async-dup" });

    const r1 = (await (await POST(make() as never)).json()) as { data: { swarmRunId: string } };
    const r2 = (await (await POST(make() as never)).json()) as { data: { swarmRunId: string } };
    expect(r1.data.swarmRunId).toBe(r2.data.swarmRunId);
  });

  it("a run cancelled before pickup is never executed by the director", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-async-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await POST(
      spawnReq(userId, { tasks: ["A", "B"], budgetMinor: 400, idempotencyKey: "async-cancel" }) as never,
    );
    const { data } = (await res.json()) as { data: { swarmRunId: string } };

    // Cancel before the worker picks up the director job.
    await cancelSwarm(ctx, data.swarmRunId);
    await runWorker(db);

    const [run] = await db
      .select()
      .from(schema.swarmRuns)
      .where(eq(schema.swarmRuns.id, data.swarmRunId));
    expect(run?.status).toBe("cancelled");
    // The director must NOT have flipped a cancelled run to succeeded.
    expect(run?.costMinor).toBe(0);
  });
});
