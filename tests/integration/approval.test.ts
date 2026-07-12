/**
 * Integration: human-in-the-loop approvals. A require_approval policy holds a
 * simulation in `awaiting_approval` (director not enqueued, run not started).
 * A human approves it (enqueues + runs) or rejects it (cancels). An agent
 * principal cannot approve its own gated spend.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { agentContext, userContext } from "@/modules/identity/access-control";
import { claimAndProcessJobs } from "@/modules/execution/worker";
import { enqueueSimulation } from "@/modules/simulations/simulation-service";
import {
  approveGatedJob,
  listPendingApprovals,
  rejectGatedJob,
} from "@/modules/approvals/approval-service";
import { MockSimulationRuntime, setSimulationRuntime } from "@/server/simulations/simulationRuntime";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

async function runWorker(db: TestDb): Promise<void> {
  for (let i = 0; i < 20; i++) if ((await claimAndProcessJobs(db, 10)) === 0) break;
}

async function requireApprovalPolicy(db: TestDb, organizationId: string): Promise<void> {
  await db.insert(schema.policyRules).values({
    organizationId,
    name: "approve big spends",
    effect: "require_approval",
    action: "*",
    resourcePattern: "*",
    conditions: { costAtLeastMinor: 1 },
    priority: 100,
    enabled: true,
  });
}

describe("integration: approvals", () => {
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

  it("holds a gated simulation, then runs it after approval", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-appr-1");
    await requireApprovalPolicy(db, organizationId);
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await enqueueSimulation(ctx, {
      mode: "parallel",
      agents: [{ name: "A", task: "x" }],
      budgetMinor: 5_000,
      idempotencyKey: "appr-sim-1",
    });
    expect(res.status).toBe("awaiting_approval");

    // The director is held — the worker runs nothing.
    await runWorker(db);
    const [heldRun] = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.id, res.simulationRunId));
    expect(heldRun?.status).toBe("awaiting_approval");

    // It shows up in the inbox.
    const pending = await listPendingApprovals(ctx, {}, db);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.capabilityKind).toBe("simulation");
    expect(pending[0]?.runId).toBe(res.simulationRunId);

    // Approve → enqueue → run to completion.
    await approveGatedJob(ctx, pending[0]!.jobId, db);
    await runWorker(db);
    const [ranRun] = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.id, res.simulationRunId));
    expect(ranRun?.status).toBe("succeeded");
  });

  it("rejection cancels the gated job and its run", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-appr-2");
    await requireApprovalPolicy(db, organizationId);
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await enqueueSimulation(ctx, {
      mode: "parallel",
      agents: [{ name: "A", task: "x" }],
      budgetMinor: 5_000,
      idempotencyKey: "appr-sim-2",
    });
    const pending = await listPendingApprovals(ctx, {}, db);
    await rejectGatedJob(ctx, pending[0]!.jobId, "too expensive", db);

    await runWorker(db);
    const [run] = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.id, res.simulationRunId));
    expect(run?.status).toBe("cancelled");
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, pending[0]!.jobId));
    expect(job?.status).toBe("cancelled");
  });

  it("an agent principal cannot approve gated spend", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-appr-3");
    await requireApprovalPolicy(db, organizationId);
    const userCtx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const res = await enqueueSimulation(userCtx, {
      mode: "parallel",
      agents: [{ name: "A", task: "x" }],
      budgetMinor: 5_000,
      idempotencyKey: "appr-sim-3",
    });
    const pending = await listPendingApprovals(userCtx, {}, db);

    const agentCtx = agentContext({ organizationId, apiKeyId: "key_x", userId: null, scopes: ["jobs.create"] });
    await expect(approveGatedJob(agentCtx, pending[0]!.jobId, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Still pending.
    expect(res.status).toBe("awaiting_approval");
  });
});
