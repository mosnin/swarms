/**
 * Integration: reapOrphanedSwarmRuns recovers a swarm run whose director job
 * died. Before this, a director death mid-fleet left the run stuck "running"
 * forever (holds leaked, poll never resolves, director falsely "succeeded").
 * Now: director maxAttempts=1 → the job reaper FAILS the director → the swarm
 * reaper settles the run to `failed` and releases outstanding worker holds.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { reapOrphanedSwarmRuns } from "@/modules/execution/worker";
import { reserveBudget } from "@/server/budget/reserveBudget";
import { scopedEntriesSince } from "@/server/budget/ledgerQueries";
import { createTestDb, seedOrg, type TestDb } from "./harness";

async function heldMinor(db: TestDb, organizationId: string): Promise<number> {
  const entries = await scopedEntriesSince(organizationId, new Date(0), {}, db, "USD");
  return entries.reduce(
    (s, e) => s + (e.kind === "hold" ? e.amountMinor : e.kind === "release" ? -e.amountMinor : 0),
    0,
  );
}

describe("integration: orphaned swarm-run reaper", () => {
  let db: TestDb;
  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => __setTestDb(undefined));

  it("fails a run whose director job failed, and releases worker holds", async () => {
    const { organizationId } = await seedOrg(db, "org-sreap-1");

    // A run stuck "running" (director died mid-fleet).
    const [run] = await db
      .insert(schema.swarmRuns)
      .values({
        organizationId,
        idempotencyKey: "orphan-1",
        status: "running",
        input: { workerCount: 2 },
        costCurrency: "USD",
        startedAt: new Date(),
      })
      .returning();
    if (!run) throw new Error("run insert failed");

    // A worker job with an outstanding hold, linked via a swarm agent row.
    const [workerJob] = await db
      .insert(schema.jobs)
      .values({
        organizationId,
        capabilityKind: "agent",
        task: "w1",
        idempotencyKey: `${run.id}-0-1`,
        inputHash: "h",
        input: { task: "w1" },
        status: "running",
        costMinor: 0,
        costCurrency: "USD",
      })
      .returning();
    if (!workerJob) throw new Error("worker insert failed");
    await reserveBudget({ organizationId, jobId: workerJob.id, amountMinor: 200, currency: "USD" }, db);
    await db.insert(schema.swarmAgents).values({
      organizationId,
      swarmRunId: run.id,
      role: "worker-1",
      jobId: workerJob.id,
      status: "running",
      costCurrency: "USD",
    });

    expect(await heldMinor(db, organizationId)).toBe(200);

    // The director job — FAILED (as the job reaper would leave it, maxAttempts=1).
    await db.insert(schema.jobs).values({
      organizationId,
      capabilityKind: "swarm",
      task: "director",
      idempotencyKey: `swarm-director-${run.id}`,
      inputHash: "h",
      input: { existingRunId: run.id },
      status: "failed",
      maxAttempts: 1,
      attempt: 1,
      costMinor: 0,
      costCurrency: "USD",
    });

    const reaped = await reapOrphanedSwarmRuns(db);
    expect(reaped).toBe(1);

    const [after] = await db.select().from(schema.swarmRuns).where(eq(schema.swarmRuns.id, run.id));
    expect(after?.status).toBe("failed");
    // The worker hold was released (net 0).
    expect(await heldMinor(db, organizationId)).toBe(0);
  });

  it("does NOT reap a run whose director is still running (live fleet)", async () => {
    const { organizationId } = await seedOrg(db, "org-sreap-2");
    const [run] = await db
      .insert(schema.swarmRuns)
      .values({
        organizationId,
        idempotencyKey: "live-1",
        status: "running",
        input: { workerCount: 1 },
        costCurrency: "USD",
        startedAt: new Date(),
      })
      .returning();
    if (!run) throw new Error("run insert failed");
    await db.insert(schema.jobs).values({
      organizationId,
      capabilityKind: "swarm",
      task: "director",
      idempotencyKey: `swarm-director-${run.id}`,
      inputHash: "h",
      input: { existingRunId: run.id },
      status: "running", // director alive
      maxAttempts: 1,
      attempt: 1,
      costMinor: 0,
      costCurrency: "USD",
    });

    const reaped = await reapOrphanedSwarmRuns(db);
    expect(reaped).toBe(0);
    const [after] = await db.select().from(schema.swarmRuns).where(eq(schema.swarmRuns.id, run.id));
    expect(after?.status).toBe("running");
  });
});
