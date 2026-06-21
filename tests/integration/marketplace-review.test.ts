import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import { createSkill, reviewSkill } from "@/modules/catalog/skill-service";
import { executeSkill } from "@/modules/execution/job-repository";
import { listMarketplaceSkills } from "@/modules/marketplace/reads";
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
  estimatedCostMinor: 0,
  estimatedDurationMs: 1,
  maxRuntimeMs: 5000,
  supportsParallelism: false,
};

async function publishVersion(db: TestDb, skillId: string, organizationId: string) {
  await db.insert(schema.skillVersions).values({
    skillId,
    organizationId,
    version: "1.0.0",
    status: "published",
    publishedAt: new Date(),
    manifest,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    runnerType: "mock",
    priceMinor: 0,
    priceCurrency: "USD",
  });
}

describe("integration: marketplace review gate", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("a public skill is pending until reviewed; cross-org use is blocked until approved", async () => {
    const creatorOrg = await seedOrg(db, "creator");
    const buyerOrg = await seedOrg(db, "buyer");
    const creatorCtx = userContext({
      organizationId: creatorOrg.organizationId,
      userId: creatorOrg.userId,
      membershipId: "m",
      role: "owner",
    });
    const buyerCtx = userContext({
      organizationId: buyerOrg.organizationId,
      userId: buyerOrg.userId,
      membershipId: "m",
      role: "owner",
    });

    const skill = await createSkill(creatorCtx, { slug: "echo", name: "Echo", visibility: "public" }, db);
    expect(skill.reviewStatus).toBe("pending");
    await publishVersion(db, skill.id, creatorOrg.organizationId);

    // Not yet approved → not listed to the buyer, and cross-org execution blocked.
    const beforeList = await listMarketplaceSkills(buyerCtx, db);
    expect(beforeList.find((s) => s.id === skill.id)).toBeUndefined();
    await expect(
      executeSkill(buyerCtx, { skillSlug: "echo", input: {}, idempotencyKey: "mkt-key-0001" }, db),
    ).rejects.toMatchObject({ code: "CAPABILITY_NOT_FOUND" });

    // Approve.
    const reviewed = await reviewSkill(creatorCtx, skill.id, { approve: true, notes: "ok" }, db);
    expect(reviewed.reviewStatus).toBe("approved");

    // Now listed + executable cross-org.
    const afterList = await listMarketplaceSkills(buyerCtx, db);
    expect(afterList.find((s) => s.id === skill.id)).toBeDefined();
    const res = await executeSkill(
      buyerCtx,
      { skillSlug: "echo", input: {}, idempotencyKey: "mkt-key-0002" },
      db,
    );
    expect(res.status).toBe("queued");
  });
});
