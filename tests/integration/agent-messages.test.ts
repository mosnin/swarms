/**
 * Integration: hosted-agent message thread (R2).
 * (1) Keyset pagination over the thread is newest-first, dense, and stable —
 *     every message is visited exactly once across pages with no overlap.
 * (2) When a wake succeeds, the agent's reply fans out an `agent.replied`
 *     webhook to every enabled org endpoint, recorded on the durable outbox.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import {
  applyCompletedWakes,
  createAgentInstance,
  listAgentMessages,
  postAgentMessage,
  wakeDueAgents,
} from "@/modules/hosted-agents/agent-service";
import { processJobInDb } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: agent message thread", () => {
  let db: TestDb;
  let organizationId: string;
  let userId: string;
  let ctx: ReturnType<typeof userContext>;

  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
    ({ organizationId, userId } = await seedOrg(db));
    ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
  });
  afterEach(() => setJobQueue(undefined));

  it("paginates the thread newest-first, densely and without overlap", async () => {
    const agent = await createAgentInstance(
      ctx,
      { name: "Scribe", instructions: "Note things.", budgetMinorPerWake: 100 },
      db,
    );

    // 25 inbound messages, oldest → newest. Sending pulls nextWakeAt forward but
    // we never run the worker, so all 25 stay as user rows in the thread.
    const contents: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      const text = `msg-${String(i).padStart(2, "0")}`;
      contents.push(text);
      await postAgentMessage(ctx, agent.id, text, db);
    }

    // Page through in tens; collect ids and contents in visitation order.
    const seen = new Set<string>();
    const ordered: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await listAgentMessages(ctx, agent.id, { limit: 10, cursor }, db);
      pages += 1;
      for (const m of page.messages) {
        expect(seen.has(m.id)).toBe(false); // no overlap across pages
        seen.add(m.id);
        ordered.push(m.content);
      }
      cursor = page.nextCursor;
    } while (cursor && pages < 10);

    expect(pages).toBe(3); // 10 + 10 + 5
    expect(seen.size).toBe(25); // dense: every message visited once
    // Newest-first: the last-sent message leads, the first-sent trails.
    expect(ordered[0]).toBe("msg-24");
    expect(ordered[ordered.length - 1]).toBe("msg-00");
    // Monotonic non-increasing sequence numbers ⇒ a total, stable order.
    const seq = ordered.map((c) => Number(c.slice(4)));
    for (let i = 1; i < seq.length; i += 1) expect(seq[i]!).toBeLessThan(seq[i - 1]!);
  });

  it("clamps the page size and exhausts the cursor at the end", async () => {
    const agent = await createAgentInstance(
      ctx,
      { name: "Clerk", instructions: "File things.", budgetMinorPerWake: 100 },
      db,
    );
    await postAgentMessage(ctx, agent.id, "only", db);

    const page = await listAgentMessages(ctx, agent.id, { limit: 1000 }, db);
    expect(page.messages).toHaveLength(1);
    expect(page.nextCursor).toBeNull(); // single page ⇒ no more
  });

  it("fans out an agent.replied webhook when a wake produces a reply", async () => {
    // An enabled org endpoint should receive the reply event.
    await db.insert(schema.webhookEndpoints).values({
      organizationId,
      url: "https://example.test/hook",
      enabled: true,
    });

    const agent = await createAgentInstance(
      ctx,
      { name: "Herald", instructions: "Reply briefly.", budgetMinorPerWake: 200 },
      db,
    );
    await postAgentMessage(ctx, agent.id, "hello there", db);

    expect(await wakeDueAgents(db)).toBe(1);
    const [job] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.organizationId, organizationId))
      .limit(1);
    const processed = await processJobInDb(job!.id, db);
    expect(processed.status).toBe("succeeded");

    expect(await applyCompletedWakes(db)).toBe(1);

    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    const replied = deliveries.filter((d) => d.eventType === "agent.replied");
    expect(replied).toHaveLength(1);
    expect(replied[0]!.url).toBe("https://example.test/hook");
    expect(replied[0]!.status).toBe("pending");
    const payload = replied[0]!.payload as { type: string; data: { agentInstanceId: string } };
    expect(payload.type).toBe("agent.replied");
    expect(payload.data.agentInstanceId).toBe(agent.id);

    // Folding again is idempotent ⇒ no duplicate webhook.
    expect(await applyCompletedWakes(db)).toBe(0);
    const after = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    expect(after.filter((d) => d.eventType === "agent.replied")).toHaveLength(1);
  });
});
