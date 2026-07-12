/**
 * Integration: lifecycle hardening for simulations + evaluations.
 *  - Orphan reapers settle a run whose director died (failed) so nothing is
 *    stuck non-terminal forever.
 *  - Terminal-state webhooks fire on success (simulation.succeeded /
 *    evaluation.succeeded) toward the caller's callbackUrl.
 *  - Cancel endpoints flip a queued run + its director to cancelled and the
 *    worker then refuses to execute it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import {
  claimAndProcessJobs,
  pruneWebhookDeliveries,
  reapOrphanedEvaluations,
  reapOrphanedSimulationRuns,
} from "@/modules/execution/worker";
import { enqueueSimulation, cancelSimulation } from "@/modules/simulations/simulation-service";
import { enqueueEvaluation, cancelEvaluation, getEvaluation } from "@/modules/evaluations/evaluation-service";
import { MockSimulationRuntime, setSimulationRuntime } from "@/server/simulations/simulationRuntime";
import { MockEvaluatorRuntime, setEvaluatorRuntime } from "@/server/evaluations/evaluatorRuntime";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

async function runWorker(db: TestDb): Promise<void> {
  for (let i = 0; i < 20; i++) if ((await claimAndProcessJobs(db, 10)) === 0) break;
}

describe("integration: simulation/evaluation lifecycle hardening", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    setSimulationRuntime(new MockSimulationRuntime());
    setEvaluatorRuntime(new MockEvaluatorRuntime());
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => {
    setJobQueue(undefined);
    setSimulationRuntime(undefined);
    setEvaluatorRuntime(undefined);
    __setTestDb(undefined);
  });

  async function ctxFor(slug: string) {
    const { organizationId, userId } = await seedOrg(db, slug);
    return { ctx: userContext({ organizationId, userId, membershipId: "m", role: "owner" }), organizationId };
  }

  it("reaps a simulation orphaned by a dead director", async () => {
    const { ctx } = await ctxFor("org-lc-1");
    const res = await enqueueSimulation(ctx, {
      mode: "parallel",
      agents: [{ name: "A", task: "t" }],
      budgetMinor: 1_000,
      idempotencyKey: "lc-sim-1",
    } as never);

    // Simulate a dead director: fail the job without running it (what the job
    // reaper does when the lease expires with no attempts left).
    const [run] = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.id, res.simulationRunId));
    await db
      .update(schema.jobs)
      .set({ status: "failed", error: { code: "LEASE_EXPIRED", message: "reaped" }, finishedAt: new Date() })
      .where(eq(schema.jobs.id, run!.directorJobId!));

    expect(await reapOrphanedSimulationRuns(db)).toBe(1);
    const [settled] = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.id, res.simulationRunId));
    expect(settled?.status).toBe("failed");
    // Idempotent: nothing left to reap.
    expect(await reapOrphanedSimulationRuns(db)).toBe(0);
  });

  it("reaps an evaluation orphaned by a dead director", async () => {
    const { ctx } = await ctxFor("org-lc-2");
    const res = await enqueueEvaluation(ctx, {
      subjectType: "text",
      content: "judge me",
      rubric: { criteria: [{ name: "quality" }] },
      budgetMinor: 100,
      idempotencyKey: "lc-eval-1",
    } as never, db);

    const [row] = await db.select().from(schema.evaluations).where(eq(schema.evaluations.id, res.evaluationId));
    await db
      .update(schema.jobs)
      .set({ status: "failed", error: { code: "LEASE_EXPIRED", message: "reaped" }, finishedAt: new Date() })
      .where(eq(schema.jobs.id, row!.directorJobId!));

    expect(await reapOrphanedEvaluations(db)).toBe(1);
    const view = await getEvaluation(ctx, res.evaluationId, db);
    expect(view.status).toBe("failed");
  });

  it("fires terminal webhooks (simulation.succeeded / evaluation.succeeded) to the callbackUrl", async () => {
    const { ctx, organizationId } = await ctxFor("org-lc-3");
    await enqueueSimulation(ctx, {
      mode: "parallel",
      agents: [{ name: "A", task: "t" }],
      budgetMinor: 1_000,
      idempotencyKey: "lc-sim-2",
      callbackUrl: "https://hooks.example.com/sim",
    } as never);
    await enqueueEvaluation(ctx, {
      subjectType: "text",
      content: "judge me",
      rubric: { criteria: [{ name: "quality" }] },
      budgetMinor: 100,
      idempotencyKey: "lc-eval-2",
      callbackUrl: "https://hooks.example.com/eval",
    } as never, db);

    await runWorker(db);

    const deliveries = await db
      .select({ eventType: schema.webhookDeliveries.eventType, url: schema.webhookDeliveries.url })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    const events = deliveries.map((d) => `${d.eventType}→${d.url}`);
    expect(events).toContain("simulation.succeeded→https://hooks.example.com/sim");
    expect(events).toContain("evaluation.succeeded→https://hooks.example.com/eval");
  });

  it("cancels a queued simulation: run + director cancelled, worker refuses it", async () => {
    const { ctx } = await ctxFor("org-lc-4");
    const res = await enqueueSimulation(ctx, {
      mode: "parallel",
      agents: [{ name: "A", task: "t" }],
      budgetMinor: 1_000,
      idempotencyKey: "lc-sim-3",
    } as never);

    const cancelled = await cancelSimulation(ctx, res.simulationRunId, db);
    expect(cancelled.status).toBe("cancelled");
    // Idempotent on a terminal run.
    const again = await cancelSimulation(ctx, res.simulationRunId, db);
    expect(again.status).toBe("cancelled");
    expect(again.message).toMatch(/terminal/);

    await runWorker(db);
    const [run] = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.id, res.simulationRunId));
    expect(run?.status).toBe("cancelled");
    expect(run?.costMinor).toBe(0); // never charged
    const [director] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, run!.directorJobId!));
    expect(director?.status).toBe("cancelled");
    // Reservation hold fully released: holds net to zero.
    const entries = await db
      .select()
      .from(schema.usageLedgerEntries)
      .where(eq(schema.usageLedgerEntries.jobId, run!.directorJobId!));
    const holdNet = entries.reduce(
      (acc, e) => acc + (e.kind === "hold" ? e.amountMinor : e.kind === "release" ? -e.amountMinor : 0),
      0,
    );
    expect(holdNet).toBe(0);
    expect(entries.some((e) => e.kind === "charge")).toBe(false);
  });

  it("cancels a queued evaluation", async () => {
    const { ctx } = await ctxFor("org-lc-5");
    const res = await enqueueEvaluation(ctx, {
      subjectType: "text",
      content: "judge me",
      rubric: { criteria: [{ name: "quality" }] },
      budgetMinor: 100,
      idempotencyKey: "lc-eval-3",
    } as never, db);

    const cancelled = await cancelEvaluation(ctx, res.evaluationId, db);
    expect(cancelled.status).toBe("cancelled");
    await runWorker(db);
    const view = await getEvaluation(ctx, res.evaluationId, db);
    expect(view.status).toBe("cancelled");
    expect(view.costMinor).toBe(0);
  });

  it("prunes only old terminal webhook deliveries", async () => {
    const { organizationId } = await ctxFor("org-lc-6");
    const old = new Date(Date.now() - 60 * 86_400_000);
    await db.insert(schema.webhookDeliveries).values([
      { organizationId, eventType: "x", url: "https://a.example.com", payload: {}, signature: "s", status: "delivered", createdAt: old, nextAttemptAt: old },
      { organizationId, eventType: "x", url: "https://b.example.com", payload: {}, signature: "s", status: "pending", createdAt: old, nextAttemptAt: old },
      { organizationId, eventType: "x", url: "https://c.example.com", payload: {}, signature: "s", status: "failed" },
    ] as never);

    expect(await pruneWebhookDeliveries(db)).toBe(1); // only the old delivered one
    const left = await db
      .select({ status: schema.webhookDeliveries.status })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    expect(left.map((l) => l.status).sort()).toEqual(["failed", "pending"]);
  });
});
