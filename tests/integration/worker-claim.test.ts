import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { claimAndProcessJobs } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, enqueueAgentJob, seedOrg, type TestDb } from "./harness";

describe("integration: worker claim + process (SKIP LOCKED path)", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("atomically claims queued jobs and processes them to success", async () => {
    const { organizationId, userId } = await seedOrg(db);

    // Enqueue 3 agent jobs.
    for (let i = 0; i < 3; i += 1) {
      await enqueueAgentJob(db, { organizationId, userId, idempotencyKey: `claim-key-${i}` });
    }

    const processed = await claimAndProcessJobs(db, 10);
    expect(processed).toBe(3);

    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.organizationId, organizationId));
    expect(jobs.every((j) => j.status === "succeeded")).toBe(true);

    // A second claim finds nothing left.
    expect(await claimAndProcessJobs(db, 10)).toBe(0);
  });
});
