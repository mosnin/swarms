/**
 * Integration: hosted-agent recurring billing (docs/HOSTED_AGENTS.md §4).
 * Standby is charged exactly once per agent-hour even under concurrent ticks;
 * an agent at zero balance is suspended and blocked from waking; a top-up
 * resumes it with the heartbeat rescheduled. All money is integer minor units
 * on the append-only ledger.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import {
  AGENT_STANDBY_MINOR_PER_HOUR,
  chargeAgentStandby,
  resumeFundedAgents,
  standbyRefId,
  hourBucket,
  suspendUnfundedAgents,
} from "@/modules/hosted-agents/billing-service";
import { setJobQueue } from "@/server/queue/queue";
import { LocalQueue } from "@/server/queue/localQueue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

const clockAt = (iso: string) => ({
  now: () => new Date(iso),
  epochMs: () => new Date(iso).getTime(),
  monotonicMs: () => new Date(iso).getTime(),
});

async function creditOrg(db: TestDb, organizationId: string, amountMinor: number): Promise<void> {
  await db.insert(schema.usageLedgerEntries).values({
    organizationId,
    direction: "credit",
    kind: "credit",
    amountMinor,
    currency: "USD",
    description: "test credit",
    refType: "test",
    refId: `test:${organizationId}:${amountMinor}:${Math.random()}`,
  });
}

async function seedAgent(
  db: TestDb,
  organizationId: string,
  overrides: Partial<typeof schema.agentInstances.$inferInsert> = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.agentInstances)
    .values({
      organizationId,
      name: "Test agent",
      instructions: "do things",
      model: "mock",
      status: "active",
      budgetMinorPerWake: 100,
      currency: "USD",
      ...overrides,
    })
    .returning({ id: schema.agentInstances.id });
  return row!.id;
}

describe("integration: hosted-agent billing", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("charges standby exactly once per agent-hour, even under concurrent ticks", async () => {
    const { organizationId } = await seedOrg(db);
    await creditOrg(db, organizationId, 1000);
    const agentId = await seedAgent(db, organizationId);
    const clock = clockAt("2026-07-24T06:30:00.000Z");

    // Two concurrent ticks in the same hour → one charge.
    const [a, b] = await Promise.all([chargeAgentStandby(db, clock), chargeAgentStandby(db, clock)]);
    expect(a + b).toBe(1);

    const refId = standbyRefId(agentId, hourBucket(clock.now()));
    const charges = await db
      .select()
      .from(schema.usageLedgerEntries)
      .where(
        and(
          eq(schema.usageLedgerEntries.refType, "agent_instance"),
          eq(schema.usageLedgerEntries.refId, refId),
        ),
      );
    expect(charges).toHaveLength(1);
    expect(charges[0]!.amountMinor).toBe(AGENT_STANDBY_MINOR_PER_HOUR);
    expect(Number.isInteger(charges[0]!.amountMinor)).toBe(true);

    // A later hour produces a second, distinct charge.
    expect(await chargeAgentStandby(db, clockAt("2026-07-24T07:05:00.000Z"))).toBe(1);
  });

  it("suspends an agent at zero balance and resumes it on top-up (heartbeat rescheduled)", async () => {
    const { organizationId } = await seedOrg(db);
    // No credit → balance 0.
    const agentId = await seedAgent(db, organizationId, { wakeIntervalMinutes: 60 });

    expect(await suspendUnfundedAgents(db)).toBe(1);
    expect(await suspendUnfundedAgents(db)).toBe(0); // idempotent
    let [row] = await db.select().from(schema.agentInstances).where(eq(schema.agentInstances.id, agentId));
    expect(row!.status).toBe("suspended");
    expect(row!.nextWakeAt).toBeNull();

    // Fund it and resume.
    await creditOrg(db, organizationId, 500);
    const clock = clockAt("2026-07-24T06:00:00.000Z");
    expect(await resumeFundedAgents(db, clock)).toBe(1);
    expect(await resumeFundedAgents(db, clock)).toBe(0); // idempotent
    [row] = await db.select().from(schema.agentInstances).where(eq(schema.agentInstances.id, agentId));
    expect(row!.status).toBe("active");
    expect(row!.nextWakeAt).toEqual(new Date("2026-07-24T07:00:00.000Z"));
  });

  it("leaves a funded agent active", async () => {
    const { organizationId } = await seedOrg(db);
    await creditOrg(db, organizationId, 1000);
    await seedAgent(db, organizationId);
    expect(await suspendUnfundedAgents(db)).toBe(0);
  });
});
