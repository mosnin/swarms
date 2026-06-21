import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import { executeSkill } from "@/modules/execution/job-repository";
import { claimAndProcessJobs } from "@/modules/execution/worker";
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

describe("integration: worker claim + process (SKIP LOCKED path)", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("atomically claims queued jobs and processes them to success", async () => {
    const { organizationId, userId } = await seedOrg(db);
    const skill = (
      await db
        .insert(schema.skills)
        .values({ organizationId, slug: "echo", name: "Echo", visibility: "private" })
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
      priceMinor: 0,
      priceCurrency: "USD",
    });
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // Enqueue 3 jobs.
    for (let i = 0; i < 3; i += 1) {
      await executeSkill(ctx, { skillSlug: "echo", input: {}, idempotencyKey: `claim-key-${i}` }, db);
    }

    const processed = await claimAndProcessJobs(db, 10);
    expect(processed).toBe(3);

    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.organizationId, organizationId));
    expect(jobs.every((j) => j.status === "succeeded")).toBe(true);

    // A second claim finds nothing left.
    expect(await claimAndProcessJobs(db, 10)).toBe(0);
  });
});
