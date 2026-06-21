import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import { runSwarm, getSwarmRun } from "@/modules/swarms/swarm-repository";
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
  estimatedCostMinor: 100,
  estimatedDurationMs: 1,
  maxRuntimeMs: 5000,
  supportsParallelism: true,
};

describe("integration: swarm orchestration", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("runs child jobs through the job system, enforces maxAgents, and merges", async () => {
    const { organizationId, userId } = await seedOrg(db);
    const skill = (
      await db
        .insert(schema.skills)
        .values({ organizationId, slug: "echo", name: "Echo", visibility: "private", defaultPriceMinor: 100 })
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
      priceMinor: 100,
      priceCurrency: "USD",
    });

    const template = (
      await db
        .insert(schema.swarmTemplates)
        .values({
          organizationId,
          slug: "research",
          name: "Competitor Research",
          visibility: "private",
          topology: { maxAgents: 2 }, // cap below the 3 declared roles
          memberRefs: [
            { role: "researcher", skillSlug: "echo" },
            { role: "pricing analyst", skillSlug: "echo" },
            { role: "synthesis auditor" }, // planning-only (no skill) — excluded by maxAgents
          ],
          priceMinor: 1000,
          priceCurrency: "USD",
        })
        .returning()
    )[0]!;

    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const run = await runSwarm(
      ctx,
      { templateId: template.id, objective: "Analyze Acme", budgetMinor: 1000 },
      db,
    );

    expect(run.status).toBe("succeeded");
    // maxAgents=2 → only 2 agents planned.
    expect(run.agents).toHaveLength(2);
    // Both agents ran real child jobs.
    expect(run.agents.every((a) => a.jobId)).toBe(true);
    // Cost rolled up from children (2 × 100).
    expect(run.costMinor).toBe(200);

    // Child jobs exist and succeeded.
    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.organizationId, organizationId));
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.status === "succeeded")).toBe(true);

    // Re-read via getSwarmRun (persistence).
    const reloaded = await getSwarmRun(ctx, run.id, db);
    expect(reloaded.agents).toHaveLength(2);
  });

  it("rejects a swarm whose estimated cost exceeds its budget", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm2");
    const skill = (
      await db
        .insert(schema.skills)
        .values({ organizationId, slug: "echo", name: "Echo", visibility: "private", defaultPriceMinor: 100 })
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
      priceMinor: 100,
      priceCurrency: "USD",
    });
    const template = (
      await db
        .insert(schema.swarmTemplates)
        .values({
          organizationId,
          slug: "research",
          name: "R",
          visibility: "private",
          topology: { maxAgents: 4 },
          memberRefs: [
            { role: "a", skillSlug: "echo" },
            { role: "b", skillSlug: "echo" },
          ],
          priceMinor: 50,
          priceCurrency: "USD",
        })
        .returning()
    )[0]!;
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    await expect(
      runSwarm(ctx, { templateId: template.id, objective: "x", budgetMinor: 150 }, db),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" }); // 2×100 = 200 > 150
  });
});
