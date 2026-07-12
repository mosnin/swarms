/**
 * Integration: evaluations run as a charged job through the worker. A judge
 * scores content against a rubric; the run records per-criterion scores, a
 * weighted overall, pass/fail, and a metered charge.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { claimAndProcessJobs } from "@/modules/execution/worker";
import { enqueueEvaluation, getEvaluation } from "@/modules/evaluations/evaluation-service";
import { MockEvaluatorRuntime, setEvaluatorRuntime } from "@/server/evaluations/evaluatorRuntime";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

async function runWorker(db: TestDb): Promise<void> {
  for (let i = 0; i < 20; i++) if ((await claimAndProcessJobs(db, 10)) === 0) break;
}

describe("integration: evaluations", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    setEvaluatorRuntime(new MockEvaluatorRuntime());
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => {
    setJobQueue(undefined);
    setEvaluatorRuntime(undefined);
    __setTestDb(undefined);
  });

  it("scores content against a rubric and charges once", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-eval-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await enqueueEvaluation(ctx, {
      subjectType: "text",
      content: "The quarterly brief covers pricing, competitors, and risks in depth.",
      rubric: { criteria: [{ name: "accuracy", weight: 2 }, { name: "clarity" }], threshold: 50 },
      budgetMinor: 200,
      idempotencyKey: "eval-1",
    });
    expect(res.status).toBe("queued");
    expect(res.overallScore).toBeNull();

    await runWorker(db);

    const view = await getEvaluation(ctx, res.evaluationId, db);
    expect(view.status).toBe("succeeded");
    expect(view.overallScore).toBeGreaterThan(0);
    expect(view.passed).toBe(true);
    expect(Array.isArray(view.scores)).toBe(true);
    expect((view.scores as unknown[]).length).toBe(2);

    // Charged exactly once, equal to the run's committed cost.
    const [director] = await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.organizationId, organizationId), eq(schema.jobs.idempotencyKey, `evaluation-director-${res.evaluationId}`)));
    expect(director?.status).toBe("succeeded");
    const charges = await db
      .select()
      .from(schema.usageLedgerEntries)
      .where(and(eq(schema.usageLedgerEntries.jobId, director!.id), eq(schema.usageLedgerEntries.kind, "charge")));
    expect(charges).toHaveLength(1);
    expect(charges[0]?.amountMinor).toBe(view.costMinor);
  });

  it("can judge a prior simulation run's output", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-eval-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    // Seed a finished simulation run with some output to judge.
    const [sim] = await db
      .insert(schema.simulationRuns)
      .values({
        organizationId,
        idempotencyKey: "sim-for-eval",
        mode: "parallel",
        status: "succeeded",
        output: { findings: "personas broadly liked the pricing" },
        costCurrency: "USD",
      })
      .returning();

    const res = await enqueueEvaluation(ctx, {
      subjectType: "simulation",
      subjectId: sim!.id,
      rubric: { criteria: [{ name: "usefulness" }] },
      budgetMinor: 100,
      idempotencyKey: "eval-2",
    });
    await runWorker(db);
    const view = await getEvaluation(ctx, res.evaluationId, db);
    expect(view.status).toBe("succeeded");
    expect(view.subjectType).toBe("simulation");
  });

  it("rejects an empty text subject", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-eval-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    await expect(
      enqueueEvaluation(ctx, {
        subjectType: "text",
        content: "   ",
        rubric: { criteria: [{ name: "x" }] },
        idempotencyKey: "eval-3",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
