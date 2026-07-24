/**
 * Integration: cloning a hosted agent (F2). A clone copies configuration into a
 * brand-new identity with empty memory and no thread; secrets are not carried
 * over. The name gets a "(copy)" suffix unless overridden, and stays within the
 * 120-char bound.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import {
  cloneAgentInstance,
  createAgentInstance,
  postAgentMessage,
} from "@/modules/hosted-agents/agent-service";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: clone hosted agent", () => {
  let db: TestDb;
  let organizationId: string;
  let ctx: ReturnType<typeof userContext>;

  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
    ({ organizationId } = await seedOrg(db));
    const seeded = await seedOrgUser(db, organizationId);
    ctx = seeded;
  });
  afterEach(() => setJobQueue(undefined));

  async function seedOrgUser(database: TestDb, orgId: string) {
    const user = (
      await database.select().from(schema.users).where(eq(schema.users.email, "test-org@test.local"))
    )[0]!;
    return userContext({ organizationId: orgId, userId: user.id, membershipId: "m", role: "owner" });
  }

  it("copies config into a fresh identity with empty memory", async () => {
    const source = await createAgentInstance(
      ctx,
      {
        name: "Concierge",
        instructions: "Answer briefly and warmly.",
        wakeIntervalMinutes: 60,
        budgetMinorPerWake: 250,
      },
      db,
    );
    // Give the source a thread so we can prove the clone does not inherit it.
    await postAgentMessage(ctx, source.id, "hello", db);

    const clone = await cloneAgentInstance(ctx, source.id, {}, db);

    expect(clone.id).not.toBe(source.id);
    expect(clone.name).toBe("Concierge (copy)");
    expect(clone.instructions).toBe(source.instructions);
    expect(clone.model).toBe(source.model);
    expect(clone.wakeIntervalMinutes).toBe(60);
    expect(clone.budgetMinorPerWake).toBe(250);
    expect(clone.stateVersion).toBe(0);
    expect(clone.lastJobId).toBeNull();

    // Fresh thread: no messages carried over.
    const cloneMessages = await db
      .select()
      .from(schema.agentMessages)
      .where(eq(schema.agentMessages.agentInstanceId, clone.id));
    expect(cloneMessages).toHaveLength(0);

    // No resource bundle inherited.
    const [row] = await db
      .select({ resourceBundleId: schema.agentInstances.resourceBundleId })
      .from(schema.agentInstances)
      .where(eq(schema.agentInstances.id, clone.id));
    expect(row?.resourceBundleId).toBeNull();
  });

  it("honors a name override and truncates to 120 chars", async () => {
    const source = await createAgentInstance(
      ctx,
      { name: "X".repeat(118), instructions: "do things", budgetMinorPerWake: 100 },
      db,
    );

    const named = await cloneAgentInstance(ctx, source.id, { name: "My Clone" }, db);
    expect(named.name).toBe("My Clone");

    // Default "(copy)" suffix would exceed 120 for a long source name → truncated.
    const suffixed = await cloneAgentInstance(ctx, source.id, {}, db);
    expect(suffixed.name.length).toBeLessThanOrEqual(120);
  });
});
