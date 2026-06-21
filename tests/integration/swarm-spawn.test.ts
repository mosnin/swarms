import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: spawn a workforce (swarm of agents)", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("spawns one worker per task, each inheriting the shared resources, under one budget", async () => {
    const { organizationId, userId } = await seedOrg(db);
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      {
        objective: "Prepare the launch",
        tasks: ["Draft the announcement", "List the risks", "Propose a timeline"],
        resources: { context: "Launch is in Q4", env: { NOTION_TOKEN: "secret-value" } },
        budgetMinor: 300,
        idempotencyKey: "swarm-int-0001",
      },
      db,
    );

    expect(res.workerCount).toBe(3);
    expect(res.workers).toHaveLength(3);
    expect(res.status).toBe("succeeded");
    expect(res.workers.every((w) => w.status === "succeeded")).toBe(true);
    // Secrets never surface in the response.
    expect(JSON.stringify(res)).not.toContain("secret-value");

    // Every worker is a real agent job that inherited the shared resources.
    for (const worker of res.workers) {
      expect(worker.jobId).toBeTruthy();
      expect(worker.output).toMatchObject({ producedBy: "mock-agent-runtime", usedContext: true });
    }

    // One shared, encrypted resource bundle for the whole workforce.
    const bundles = await db.select().from(schema.resourceBundles);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.encrypted).not.toContain("secret-value");

    // Aggregate spend stayed within the swarm budget.
    expect(res.costMinor).toBeGreaterThan(0);
    expect(res.costMinor).toBeLessThanOrEqual(300);

    // The swarm run was persisted with no template (the agent-workforce path).
    const run = (
      await db.select().from(schema.swarmRuns).where(eq(schema.swarmRuns.id, res.swarmRunId))
    )[0];
    expect(run?.swarmTemplateId).toBeNull();
  });

  it("splits the aggregate budget into a hard per-worker GPU ceiling", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await spawnSwarm(
      ctx,
      { tasks: ["a", "b"], budgetMinor: 8, idempotencyKey: "swarm-int-0002" },
      db,
    );
    // rate 2/sec, budget 8 over 2 workers = 4 minor each = 2 GPU-seconds per worker.
    expect(res.maxGpuSecondsPerWorker).toBe(2);
    expect(res.costMinor).toBeLessThanOrEqual(8);
  });

  it("rejects an empty workforce", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    await expect(
      spawnSwarm(ctx, { tasks: ["   "], idempotencyKey: "swarm-int-0003" }, db),
    ).rejects.toThrow(/at least one task/i);
  });
});
