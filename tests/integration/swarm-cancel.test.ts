/**
 * Integration tests for cancelSwarm service.
 *
 * We test the cancel logic directly against the DB by inserting swarm run +
 * agent rows and verifying the status transitions.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { cancelSwarm } from "@/modules/swarms/cancel-swarm";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: cancelSwarm", () => {
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

  it("cancels a running swarm and marks all in-flight workers as cancelled", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-cancel-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // Spawn a real swarm so we have live DB rows.
    const res = await spawnSwarm(
      ctx,
      { tasks: ["task A", "task B"], budgetMinor: 200, idempotencyKey: "cancel-test-1" },
      db,
    );

    // The swarm has already succeeded because the mock runtime is synchronous.
    // Insert a fresh run + agents directly in "running" state for the cancel test.
    const [freshRun] = await db
      .insert(schema.swarmRuns)
      .values({
        organizationId,
        idempotencyKey: "cancel-test-run",
        status: "running",
        input: { objective: "test", workerCount: 2 },
        costCurrency: "USD",
        startedAt: new Date(),
      })
      .returning();

    if (!freshRun) throw new Error("Failed to create test run");

    await db.insert(schema.swarmAgents).values([
      { organizationId, swarmRunId: freshRun.id, role: "worker-1", status: "running", costCurrency: "USD" },
      { organizationId, swarmRunId: freshRun.id, role: "worker-2", status: "queued", costCurrency: "USD" },
    ]);

    const result = await cancelSwarm(ctx, freshRun.id, db);

    expect(result.status).toBe("cancelled");
    expect(result.cancelledAgents).toBe(2);

    // Verify DB state.
    const updatedRun = (await db.select().from(schema.swarmRuns).where(eq(schema.swarmRuns.id, freshRun.id)))[0];
    expect(updatedRun?.status).toBe("cancelled");

    const updatedAgents = await db.select().from(schema.swarmAgents).where(eq(schema.swarmAgents.swarmRunId, freshRun.id));
    expect(updatedAgents.every((a) => a.status === "cancelled")).toBe(true);

    // The original swarm result is unaffected.
    expect(res.status).toBe("succeeded");
  });

  it("is idempotent: cancelling an already-cancelled run returns current state without error", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-cancel-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const [run] = await db
      .insert(schema.swarmRuns)
      .values({
        organizationId,
        idempotencyKey: "cancel-idempotent",
        status: "cancelled",
        input: {},
        costCurrency: "USD",
      })
      .returning();
    if (!run) throw new Error("Failed to insert run");

    const result = await cancelSwarm(ctx, run.id, db);

    expect(result.status).toBe("cancelled");
    expect(result.cancelledAgents).toBe(0);
    expect(result.message).toMatch(/terminal/i);
  });

  it("is idempotent: cancelling a succeeded run returns succeeded without error", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-cancel-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const [run] = await db
      .insert(schema.swarmRuns)
      .values({
        organizationId,
        idempotencyKey: "cancel-succeeded",
        status: "succeeded",
        input: {},
        costCurrency: "USD",
      })
      .returning();
    if (!run) throw new Error("Failed to insert run");

    const result = await cancelSwarm(ctx, run.id, db);

    expect(result.status).toBe("succeeded");
    expect(result.cancelledAgents).toBe(0);
  });

  it("throws NOT_FOUND when swarm run does not exist", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-cancel-4");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await expect(cancelSwarm(ctx, "nonexistent-id", db)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
