import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import { spawnAgent } from "@/modules/agents/spawn-service";
import { processJobInDb } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: spawn agent (on-demand labor)", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("spawns a worker agent that inherits resources, runs, meters GPU, and charges", async () => {
    const { organizationId, userId } = await seedOrg(db);
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const spawned = await spawnAgent(
      ctx,
      {
        task: "Summarize the quarterly notes and propose next steps.",
        resources: {
          context: "The notes are about Q3 growth.",
          env: { NOTION_TOKEN: "secret-value" },
          mcpServers: [{ name: "notion", url: "https://mcp.notion.test" }],
        },
        budgetMinor: 200,
        idempotencyKey: "spawn-int-0001",
      },
      db,
    );

    expect(spawned.status).toBe("queued");
    expect(spawned.maxGpuSeconds).toBeGreaterThan(0);
    // The summary reports what the worker inherited — never the secret values.
    expect(spawned.resources.envKeys).toEqual(["NOTION_TOKEN"]);
    expect(spawned.resources.mcpServers).toEqual(["notion"]);
    expect(JSON.stringify(spawned)).not.toContain("secret-value");

    // Run the worker; the agent completes and reports it received the resources.
    const processed = await processJobInDb(spawned.jobId, db);
    expect(processed.status).toBe("succeeded");
    expect(processed.output).toMatchObject({ producedBy: "mock-agent-runtime", usedContext: true });
    expect((processed.output as { inheritedResources: { envKeys: string[] } }).inheritedResources.envKeys).toEqual([
      "NOTION_TOKEN",
    ]);

    // GPU was metered and charged (within the budget ceiling).
    expect(processed.costMinor).toBeGreaterThan(0);
    expect(processed.costMinor).toBeLessThanOrEqual(200);
    const ledger = await db
      .select()
      .from(schema.usageLedgerEntries)
      .where(eq(schema.usageLedgerEntries.jobId, spawned.jobId));
    expect(ledger.some((e) => e.kind === "charge")).toBe(true);

    // The encrypted resource bundle never stored the secret in plaintext.
    const bundles = await db.select().from(schema.resourceBundles);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.encrypted).not.toContain("secret-value");
  });

  it("caps GPU spend at the budget — a tiny budget yields a tiny ceiling", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-spawn2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const spawned = await spawnAgent(
      ctx,
      { task: "x".repeat(5000), budgetMinor: 4, idempotencyKey: "spawn-int-0002" },
      db,
    );
    // rate is 2/sec by default → budget 4 = 2 GPU-seconds ceiling.
    expect(spawned.maxGpuSeconds).toBe(2);
    const processed = await processJobInDb(spawned.jobId, db);
    expect(processed.costMinor).toBeLessThanOrEqual(4);
  });
});
