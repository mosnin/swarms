import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import { executeSkill, getJob } from "@/modules/execution/job-repository";
import { processJobInDb } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

const manifest = {
  name: "Echo",
  version: "1.0.0",
  description: "",
  inputSchema: { type: "object", required: ["msg"], properties: { msg: { type: "string" } } },
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

describe("integration: free execution end-to-end", () => {
  let db: TestDb;

  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("creates an idempotent job, processes it, and records ledger + audit", async () => {
    const { organizationId, userId } = await seedOrg(db);
    await publishSkill(db, organizationId);
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await executeSkill(
      ctx,
      { skillSlug: "echo", input: { msg: "hi" }, idempotencyKey: "idem-int-0001" },
      db,
    );
    expect(res.status).toBe("queued");

    // Idempotent replay returns the same job, no duplicate.
    const replay = await executeSkill(
      ctx,
      { skillSlug: "echo", input: { msg: "hi" }, idempotencyKey: "idem-int-0001" },
      db,
    );
    expect(replay.jobId).toBe(res.jobId);
    const allJobs = await db.select().from(schema.jobs).where(eq(schema.jobs.organizationId, organizationId));
    expect(allJobs).toHaveLength(1);

    // Worker processes it to success.
    const processed = await processJobInDb(res.jobId, db);
    expect(processed.status).toBe("succeeded");
    expect(processed.output).toMatchObject({ producedBy: "mock-runner" });

    const view = await getJob(ctx, res.jobId, db);
    expect(view.status).toBe("succeeded");

    // A usage charge was recorded (append-only ledger).
    const ledger = await db
      .select()
      .from(schema.usageLedgerEntries)
      .where(eq(schema.usageLedgerEntries.jobId, res.jobId));
    expect(ledger.some((e) => e.kind === "charge" && e.amountMinor === 200)).toBe(true);

    // Audit trail recorded creation + success.
    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.organizationId, organizationId));
    const actions = audit.map((a) => a.action);
    expect(actions).toContain("job.created");
    expect(actions).toContain("job.succeeded");
  });

  it("rejects a reused idempotency key with different input", async () => {
    const { organizationId, userId } = await seedOrg(db, "org2");
    await publishSkill(db, organizationId);
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await executeSkill(ctx, { skillSlug: "echo", input: { msg: "a" }, idempotencyKey: "dup-key-0001" }, db);
    await expect(
      executeSkill(ctx, { skillSlug: "echo", input: { msg: "b" }, idempotencyKey: "dup-key-0001" }, db),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("blocks execution when a hard-stop budget would be exceeded", async () => {
    const { organizationId, userId } = await seedOrg(db, "org3");
    await publishSkill(db, organizationId);
    await db.insert(schema.budgets).values({
      organizationId,
      name: "tiny",
      limitMinor: 100, // below the 200 price
      currency: "USD",
      period: "monthly",
      hardStop: true,
    });
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await expect(
      executeSkill(ctx, { skillSlug: "echo", input: { msg: "x" }, idempotencyKey: "budget-key-001" }, db),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
});
