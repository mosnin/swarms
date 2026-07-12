/**
 * Integration: replay-with-overrides. A completed job or simulation can be
 * re-run as a NEW run with tweaked model/budget/objective; the original is
 * untouched, resources carry over, and replays get fresh idempotency keys.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { userContext } from "@/modules/identity/access-control";
import { claimAndProcessJobs } from "@/modules/execution/worker";
import { spawnAgent } from "@/modules/agents/spawn-service";
import { enqueueSimulation } from "@/modules/simulations/simulation-service";
import { MockSimulationRuntime, setSimulationRuntime } from "@/server/simulations/simulationRuntime";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { POST as jobReplay } from "@/app/api/v1/jobs/[jobId]/replay/route";
import { POST as simReplay } from "@/app/api/v1/simulations/[simulationRunId]/replay/route";

function req(userId: string, url: string, body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", [SESSION_USER_HEADER]: userId },
    body: JSON.stringify(body),
  });
}

async function runWorker(db: TestDb): Promise<void> {
  for (let i = 0; i < 20; i++) if ((await claimAndProcessJobs(db, 10)) === 0) break;
}

describe("integration: replay with overrides", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    setSimulationRuntime(new MockSimulationRuntime());
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => {
    setJobQueue(undefined);
    setSimulationRuntime(undefined);
    __setTestDb(undefined);
  });

  it("replays a job with a model + budget override; original untouched", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-rep-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const original = await spawnAgent(
      ctx,
      { task: "summarize the report", budgetMinor: 200, idempotencyKey: "rep-orig-1" },
      db,
    );
    await runWorker(db);

    const res = await jobReplay(
      req(userId, `http://test.local/api/v1/jobs/${original.jobId}/replay`, {
        model: "deepseek/deepseek-chat-v4",
        budgetMinor: 400,
        replayTag: "ab-1",
      }) as never,
      { params: Promise.resolve({ jobId: original.jobId }) },
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { data: { jobId: string; replayedFrom: string; maxGpuSeconds: number } };
    expect(body.data.replayedFrom).toBe(original.jobId);
    expect(body.data.jobId).not.toBe(original.jobId);
    // Budget override took effect: 400 minor at rate 2 → 200 GPU-seconds.
    expect(body.data.maxGpuSeconds).toBe(200);

    // Same overrides + same tag replays idempotently (same new job).
    const res2 = await jobReplay(
      req(userId, `http://test.local/api/v1/jobs/${original.jobId}/replay`, {
        model: "deepseek/deepseek-chat-v4",
        budgetMinor: 400,
        replayTag: "ab-1",
      }) as never,
      { params: Promise.resolve({ jobId: original.jobId }) },
    );
    const body2 = (await res2.json()) as { data: { jobId: string } };
    expect(body2.data.jobId).toBe(body.data.jobId);

    // Original job is untouched.
    const [origRow] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, original.jobId));
    expect(origRow?.status).toBe("succeeded");
  });

  it("replays a simulation with an objective override, recovering the crew config", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-rep-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const original = await enqueueSimulation(ctx, {
      mode: "collaborative",
      agents: [{ name: "CFO" }, { name: "PM" }],
      objective: "react to pricing v1",
      budgetMinor: 5_000,
      idempotencyKey: "rep-sim-1",
    } as never);
    await runWorker(db);

    const res = await simReplay(
      req(userId, `http://test.local/api/v1/simulations/${original.simulationRunId}/replay`, {
        objective: "react to pricing v2",
      }) as never,
      { params: Promise.resolve({ simulationRunId: original.simulationRunId }) },
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      data: { simulationRunId: string; replayedFrom: string; agentCount: number };
    };
    expect(body.data.replayedFrom).toBe(original.simulationRunId);
    expect(body.data.simulationRunId).not.toBe(original.simulationRunId);
    // Crew recovered from the director config.
    expect(body.data.agentCount).toBe(2);

    await runWorker(db);
    const [replayRun] = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.id, body.data.simulationRunId));
    expect(replayRun?.status).toBe("succeeded");
    expect((replayRun?.input as { objective?: string })?.objective).toBe("react to pricing v2");
  });

  it("refuses to replay a non-agent job via the job endpoint", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-rep-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const sim = await enqueueSimulation(ctx, {
      mode: "parallel",
      agents: [{ name: "A", task: "t" }],
      budgetMinor: 1_000,
      idempotencyKey: "rep-sim-2",
    } as never);
    const [run] = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.id, sim.simulationRunId));

    const res = await jobReplay(
      req(userId, `http://test.local/api/v1/jobs/${run!.directorJobId}/replay`) as never,
      { params: Promise.resolve({ jobId: run!.directorJobId! }) },
    );
    expect(res.status).toBe(400);
  });
});
