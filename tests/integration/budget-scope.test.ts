import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { agentContext } from "@/modules/identity/access-control";
import { executeSkill } from "@/modules/execution/job-repository";
import { processJobInDb } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

const manifest = {
  name: "Echo",
  version: "1.0.0",
  description: "",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  permissions: [],
  riskLevel: "low",
  estimatedCostMinor: 200,
  estimatedDurationMs: 10,
  maxRuntimeMs: 5000,
  supportsParallelism: false,
};

async function publishSkill(db: TestDb, organizationId: string) {
  const skill = (
    await db
      .insert(schema.skills)
      .values({ organizationId, slug: "echo", name: "Echo", visibility: "private", defaultPriceMinor: 200 })
      .returning()
  )[0]!;
  await db.insert(schema.skillVersions).values({
    skillId: skill.id,
    organizationId,
    version: "1.0.0",
    status: "published",
    publishedAt: new Date(),
    manifest,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    runnerType: "mock",
    priceMinor: 200,
    priceCurrency: "USD",
  });
  return skill;
}

describe("integration: per-API-key budget scope", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("enforces a budget scoped to one API key and ignores others", async () => {
    const { organizationId } = await seedOrg(db);
    await publishSkill(db, organizationId);

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

    // Budget caps key A at 300 minor units/month (price is 200).
    await db.insert(schema.budgets).values({
      organizationId,
      name: "key-a-cap",
      scope: { apiKeyId: keyA.id },
      limitMinor: 300,
      currency: "USD",
      period: "monthly",
      hardStop: true,
    });

    const ctxA = agentContext({ organizationId, apiKeyId: keyA.id, userId: null, scopes: [] });
    const ctxB = agentContext({ organizationId, apiKeyId: keyB.id, userId: null, scopes: [] });

    // Key A: first execution succeeds and commits 200.
    const j1 = await executeSkill(ctxA, { skillSlug: "echo", input: {}, idempotencyKey: "a-key-0001" }, db);
    await processJobInDb(j1.jobId, db);

    // Key A: second execution would push committed to 400 > 300 → blocked.
    await expect(
      executeSkill(ctxA, { skillSlug: "echo", input: {}, idempotencyKey: "a-key-0002" }, db),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });

    // Key B is NOT subject to key A's budget → allowed.
    const jB = await executeSkill(ctxB, { skillSlug: "echo", input: {}, idempotencyKey: "b-key-0001" }, db);
    expect(jB.status).toBe("queued");
  });
});
