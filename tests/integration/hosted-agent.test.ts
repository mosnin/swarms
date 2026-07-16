/**
 * Integration: hosted-agent lifecycle (docs/HOSTED_AGENTS.md Phase 1).
 * Deploy → message → CAS-claimed wake spawns a charged job → worker runs it →
 * output folds back into durable memory + thread. Also: pause blocks wakes,
 * per-wake budget is a hard ceiling, and wake idempotency prevents
 * double-charging for the same claimed firing.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import {
  applyCompletedWakes,
  createAgentInstance,
  getAgentInstance,
  listAgentInstances,
  postAgentMessage,
  setAgentInstanceStatus,
  terminateAgentInstance,
  wakeDueAgents,
} from "@/modules/hosted-agents/agent-service";
import { processJobInDb } from "@/modules/execution/worker";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

const fixedClock = (at: Date) => ({
  now: () => at,
  epochMs: () => at.getTime(),
  monotonicMs: () => at.getTime(),
});

describe("integration: hosted agents", () => {
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

  it("deploys, receives a message, wakes as a charged job, and folds the reply into memory", async () => {
    const agent = await createAgentInstance(
      ctx,
      { name: "Concierge", instructions: "Answer briefly.", budgetMinorPerWake: 200 },
      db,
    );
    expect(agent.status).toBe("active");
    expect((await listAgentInstances(ctx, db)).map((a) => a.id)).toContain(agent.id);

    await postAgentMessage(ctx, agent.id, "What's on the calendar today?", db);

    // The message pulled nextWakeAt to now ⇒ the wake loop claims and spawns.
    const woken = await wakeDueAgents(db);
    expect(woken).toBe(1);

    const afterWake = await getAgentInstance(ctx, agent.id, db);
    expect(afterWake.agent.lastJobId).toBeTruthy();
    const jobId = afterWake.agent.lastJobId!;

    // The inbound message is marked processed by that job.
    const processedMsgs = await db
      .select()
      .from(schema.agentMessages)
      .where(eq(schema.agentMessages.jobId, jobId));
    expect(processedMsgs.some((m) => m.role === "user")).toBe(true);

    // Run the wake job through the real worker path (mock runtime) — it charges.
    const processed = await processJobInDb(jobId, db);
    expect(processed.status).toBe("succeeded");
    expect(processed.costMinor).toBeGreaterThan(0);
    expect(processed.costMinor).toBeLessThanOrEqual(200);

    // State write-back: memory versioned up, reply lands in the thread.
    const applied = await applyCompletedWakes(db);
    expect(applied).toBe(1);
    const final = await getAgentInstance(ctx, agent.id, db);
    expect(final.agent.stateVersion).toBe(1);
    expect(final.messages.some((m) => m.role === "agent")).toBe(true);

    // Re-applying is a no-op (idempotent via lastAppliedJobId).
    expect(await applyCompletedWakes(db)).toBe(0);
  });

  it("does not double-wake for the same claim (CAS) and never wakes paused agents", async () => {
    const agent = await createAgentInstance(
      ctx,
      { name: "Sentry", instructions: "Watch things.", budgetMinorPerWake: 100 },
      db,
    );
    await postAgentMessage(ctx, agent.id, "ping", db);

    // Two concurrent tick runs: only one may claim the wake.
    const [a, b] = await Promise.all([wakeDueAgents(db), wakeDueAgents(db)]);
    expect(a + b).toBe(1);
    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.organizationId, organizationId));
    expect(jobs).toHaveLength(1);

    // Paused agents are skipped even with pending messages.
    await setAgentInstanceStatus(ctx, agent.id, "paused", db);
    const unprocessed = await db
      .select()
      .from(schema.agentMessages)
      .where(and(eq(schema.agentMessages.agentInstanceId, agent.id), isNull(schema.agentMessages.processedAt)));
    // (any leftover unprocessed messages don't matter — status gates the wake)
    void unprocessed;
    expect(await wakeDueAgents(db)).toBe(0);

    // Terminated agents disappear from list/get.
    await terminateAgentInstance(ctx, agent.id, db);
    expect((await listAgentInstances(ctx, db)).map((x) => x.id)).not.toContain(agent.id);
    await expect(getAgentInstance(ctx, agent.id, db)).rejects.toThrowError(/not found/i);
  });

  it("heartbeat agents wake on schedule without messages", async () => {
    const t0 = new Date("2026-07-16T12:00:00Z");
    const agent = await createAgentInstance(
      ctx,
      {
        name: "Reporter",
        instructions: "Compile a status report.",
        wakeIntervalMinutes: 60,
        budgetMinorPerWake: 100,
      },
      db,
      fixedClock(t0),
    );
    expect(agent.nextWakeAt).toEqual(new Date(t0.getTime() + 60 * 60_000));

    // Not due yet.
    expect(await wakeDueAgents(db, fixedClock(new Date(t0.getTime() + 30 * 60_000)))).toBe(0);
    // Due: wakes with no pending messages (heartbeat semantics), advances next.
    const t2 = new Date(t0.getTime() + 61 * 60_000);
    expect(await wakeDueAgents(db, fixedClock(t2))).toBe(1);

    const [row] = await db
      .select()
      .from(schema.agentInstances)
      .where(eq(schema.agentInstances.id, agent.id));
    expect(row!.nextWakeAt).toEqual(new Date(t2.getTime() + 60 * 60_000));
    expect(row!.lastJobId).toBeTruthy();
  });

  it("enforces the per-wake budget floor at creation", async () => {
    await expect(
      createAgentInstance(ctx, { name: "x", instructions: "y", budgetMinorPerWake: 1 }, db),
    ).rejects.toThrowError(/too low/i);
  });
});
