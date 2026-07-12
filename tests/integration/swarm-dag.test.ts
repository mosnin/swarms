/**
 * Integration: DAG swarms. POST /api/v1/swarms with `steps` enqueues a director
 * that executes the graph in topological waves — dependants see their
 * dependencies' outputs, roles are step names, and the run settles with the
 * full cost accounted.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { claimAndProcessJobs } from "@/modules/execution/worker";
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
  for (let i = 0; i < 20; i++) if ((await claimAndProcessJobs(db, 10)) === 0) break;
}

describe("integration: DAG swarms (steps)", () => {
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

  it("runs a diamond graph: roles are step names and dependants see dep outputs", async () => {
    const { userId } = await seedOrg(db, "org-dag-1");

    const res = await POST(
      spawnReq(userId, {
        steps: [
          { name: "scout", task: "gather the raw facts" },
          { name: "left", task: "analyze half A", dependsOn: ["scout"] },
          { name: "right", task: "analyze half B", dependsOn: ["scout"] },
          { name: "merge", task: "combine both analyses", dependsOn: ["left", "right"] },
        ],
        budgetMinor: 800,
        idempotencyKey: "dag-run-1",
      }) as never,
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { data: { swarmRunId: string; status: string; workerCount: number } };
    expect(body.data.status).toBe("queued");
    expect(body.data.workerCount).toBe(4);

    await runWorker(db);

    const [run] = await db
      .select()
      .from(schema.swarmRuns)
      .where(eq(schema.swarmRuns.id, body.data.swarmRunId));
    expect(run?.status).toBe("succeeded");

    const agents = await db
      .select()
      .from(schema.swarmAgents)
      .where(eq(schema.swarmAgents.swarmRunId, body.data.swarmRunId));
    const roles = agents.map((a) => a.role).sort();
    expect(roles).toEqual(["left", "merge", "right", "scout"]);
    expect(agents.every((a) => a.status === "succeeded")).toBe(true);

    // The merge step's job task must embed its dependencies' outputs as context.
    const merge = agents.find((a) => a.role === "merge");
    const [mergeJob] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, merge!.jobId!));
    expect(mergeJob?.task).toContain("Previous step output");
    expect(mergeJob?.task).toContain("left");
    expect(mergeJob?.task).toContain("right");

    // Run cost equals the sum of the step charges.
    const total = agents.reduce((acc, a) => acc + a.costMinor, 0);
    expect(run?.costMinor).toBe(total);
  });

  it("rejects a cyclic graph synchronously", async () => {
    const { userId } = await seedOrg(db, "org-dag-2");
    const res = await POST(
      spawnReq(userId, {
        steps: [
          { name: "a", task: "t", dependsOn: ["b"] },
          { name: "b", task: "t", dependsOn: ["a"] },
        ],
        budgetMinor: 400,
        idempotencyKey: "dag-cycle",
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("rejects steps combined with sequential", async () => {
    const { userId } = await seedOrg(db, "org-dag-3");
    const res = await POST(
      spawnReq(userId, {
        steps: [{ name: "a", task: "t" }],
        sequential: true,
        budgetMinor: 200,
        idempotencyKey: "dag-seq",
      }) as never,
    );
    expect(res.status).toBe(400);
  });
});
