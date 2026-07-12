/**
 * Integration: POST /api/v1/simulations is async. The request enqueues the
 * simulation (creates the run + a charged director job) and returns 202 queued;
 * the crew never runs in the request handler. The worker then claims the
 * director job and runs the whole crew in one sandbox (mock runtime here),
 * charging exactly once (base per agent + metered GPU).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { __setTestDb } from "@/lib/db";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { claimAndProcessJobs } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { setSimulationRuntime, MockSimulationRuntime } from "@/server/simulations/simulationRuntime";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { POST, GET } from "@/app/api/v1/simulations/route";

const BASE = env.SIMULATION_AGENT_BASE_MINOR ?? 25;

function simReq(userId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://test.local/api/v1/simulations", {
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

describe("integration: POST /api/v1/simulations (async)", () => {
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

  it("returns 202 queued, then the worker runs the crew and charges once", async () => {
    const { userId, organizationId } = await seedOrg(db, "org-sim-1");

    const res = await POST(
      simReq(userId, {
        mode: "collaborative",
        agents: [{ name: "Skeptical CFO" }, { name: "Eager PM" }],
        budgetMinor: 5_000,
        idempotencyKey: "sim-run-0001",
      }) as never,
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      data: { simulationRunId: string; status: string; agentCount: number; baseFeeMinor: number };
    };
    expect(body.data.status).toBe("queued");
    expect(body.data.agentCount).toBe(2);
    expect(body.data.baseFeeMinor).toBe(2 * BASE);

    // The crew did NOT run in the request — no persona rows yet.
    const before = await db
      .select()
      .from(schema.simulationAgents)
      .where(eq(schema.simulationAgents.simulationRunId, body.data.simulationRunId));
    expect(before.length).toBe(0);

    await runWorker(db);

    const [run] = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.id, body.data.simulationRunId));
    expect(run?.status).toBe("succeeded");
    expect(run?.baseFeeMinor).toBe(2 * BASE);
    expect(run?.costMinor).toBe(run!.baseFeeMinor + run!.gpuSeconds * (env.GPU_RATE_MINOR_PER_SECOND ?? 2));
    expect(run?.gpuSeconds).toBeGreaterThan(0);

    const personas = await db
      .select()
      .from(schema.simulationAgents)
      .where(eq(schema.simulationAgents.simulationRunId, body.data.simulationRunId));
    expect(personas.length).toBe(2);

    // Exactly one committed charge for the director job, equal to the run cost.
    const director = (
      await db
        .select()
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.organizationId, organizationId),
            eq(schema.jobs.idempotencyKey, `simulation-director-${run!.id}`),
          ),
        )
        .limit(1)
    )[0];
    expect(director?.status).toBe("succeeded");
    expect(director?.costMinor).toBe(run!.costMinor);

    const charges = await db
      .select()
      .from(schema.usageLedgerEntries)
      .where(
        and(
          eq(schema.usageLedgerEntries.jobId, director!.id),
          eq(schema.usageLedgerEntries.kind, "charge"),
        ),
      );
    expect(charges.length).toBe(1);
    expect(charges[0]?.amountMinor).toBe(run!.costMinor);
  });

  it("is idempotent: replaying the key returns the same run", async () => {
    const { userId } = await seedOrg(db, "org-sim-2");
    const make = () =>
      simReq(userId, {
        mode: "parallel",
        agents: [{ name: "Researcher", task: "research X" }],
        budgetMinor: 2_000,
        idempotencyKey: "sim-dup",
      });

    const r1 = (await (await POST(make() as never)).json()) as { data: { simulationRunId: string } };
    const r2 = (await (await POST(make() as never)).json()) as { data: { simulationRunId: string } };
    expect(r1.data.simulationRunId).toBe(r2.data.simulationRunId);
  });

  it("rejects a budget too low to cover the base fee + one GPU-second", async () => {
    const { userId } = await seedOrg(db, "org-sim-3");
    const res = await POST(
      simReq(userId, {
        mode: "parallel",
        agents: [{ name: "A" }, { name: "B" }],
        budgetMinor: 2 * BASE, // no room for any GPU second
        idempotencyKey: "sim-too-low",
      }) as never,
    );
    // enqueueSimulation throws BUDGET_EXCEEDED, surfaced by the route as 4xx.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("lists the org's simulation runs", async () => {
    const { userId } = await seedOrg(db, "org-sim-4");
    await POST(
      simReq(userId, {
        mode: "parallel",
        agents: [{ name: "A" }],
        budgetMinor: 2_000,
        idempotencyKey: "sim-list-1",
      }) as never,
    );
    const listReq = new NextRequest("http://test.local/api/v1/simulations", {
      headers: { [SESSION_USER_HEADER]: userId },
    });
    const listRes = await GET(listReq as never);
    const listBody = (await listRes.json()) as { data: { runs: unknown[] } };
    expect(listBody.data.runs.length).toBe(1);
  });
});
