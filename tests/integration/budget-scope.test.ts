import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { processJobInDb } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, enqueueAgentJob, seedOrg, type TestDb } from "./harness";

describe("integration: per-API-key budget scope", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("enforces a budget scoped to one API key and ignores others", async () => {
    const { organizationId } = await seedOrg(db);

    const keyA = (
      await db
        .insert(schema.apiKeys)
        .values({ organizationId, name: "A", prefix: "hc_a", hashedKey: "ha", scopes: [] })
        .returning()
    )[0]!;
    const keyB = (
      await db
        .insert(schema.apiKeys)
        .values({ organizationId, name: "B", prefix: "hc_b", hashedKey: "hb", scopes: [] })
        .returning()
    )[0]!;

    // Budget caps key A at 300 minor units/month (each job commits 200).
    await db.insert(schema.budgets).values({
      organizationId,
      name: "key-a-cap",
      scope: { apiKeyId: keyA.id },
      limitMinor: 300,
      currency: "USD",
      period: "monthly",
      hardStop: true,
    });

    // A one-word task is 1 GPU-second; rate 200 → exactly 200 committed per job.
    const job = { maxGpuSeconds: 1, rateMinorPerSecond: 200 };

    // Key A: first execution succeeds and commits 200.
    const j1 = await enqueueAgentJob(db, {
      organizationId,
      apiKeyId: keyA.id,
      idempotencyKey: "a-key-0001",
      ...job,
    });
    await processJobInDb(j1.jobId, db);

    // Key A: second execution would push committed to 400 > 300 → blocked.
    await expect(
      enqueueAgentJob(db, { organizationId, apiKeyId: keyA.id, idempotencyKey: "a-key-0002", ...job }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });

    // Key B is NOT subject to key A's budget → allowed.
    const jB = await enqueueAgentJob(db, {
      organizationId,
      apiKeyId: keyB.id,
      idempotencyKey: "b-key-0001",
      ...job,
    });
    expect(jB.status).toBe("queued");
  });
});
