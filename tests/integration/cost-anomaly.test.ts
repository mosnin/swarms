/**
 * Integration: a settled charge far above the org's recent average raises a
 * `cost.anomaly` audit event + webhook via the worker settle path.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { processJobInDb } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, enqueueAgentJob, seedOrg, type TestDb } from "./harness";

describe("integration: cost anomaly", () => {
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

  async function runJob(organizationId: string, userId: string, key: string, rate: number): Promise<void> {
    const { jobId } = await enqueueAgentJob(db, {
      organizationId,
      userId,
      idempotencyKey: key,
      task: "echo", // one-word task → 1 GPU-second → cost = rate
      maxGpuSeconds: 1,
      rateMinorPerSecond: rate,
    });
    await processJobInDb(jobId, db);
  }

  it("raises cost.anomaly when a charge dwarfs the trailing average", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-anom-1");
    // Baseline: four ~100-minor charges.
    for (let i = 0; i < 4; i++) await runJob(organizationId, userId, `base-${i}`, 100);
    // No anomaly yet.
    const before = await db
      .select()
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.organizationId, organizationId), eq(schema.auditEvents.action, "cost.anomaly")));
    expect(before).toHaveLength(0);

    // A 5000-minor charge — ~50× the average → anomaly.
    await runJob(organizationId, userId, "spike", 5_000);

    const after = await db
      .select()
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.organizationId, organizationId), eq(schema.auditEvents.action, "cost.anomaly")));
    expect(after).toHaveLength(1);
  });

  it("does not flag charges in line with the average", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-anom-2");
    for (let i = 0; i < 5; i++) await runJob(organizationId, userId, `steady-${i}`, 120);
    const anomalies = await db
      .select()
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.organizationId, organizationId), eq(schema.auditEvents.action, "cost.anomaly")));
    expect(anomalies).toHaveLength(0);
  });
});
