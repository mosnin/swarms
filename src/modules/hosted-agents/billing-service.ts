/**
 * Hosted-agent recurring billing (docs/HOSTED_AGENTS.md §4). A hosted agent
 * costs a small standby fee for every hour it stays active, charged once per
 * agent-hour to the append-only ledger, plus the metered per-wake job charges
 * the wake path already produces. Funding is a hard ceiling: an agent may
 * occupy `active` only while its org balance is positive — the moment it goes
 * to zero the agent is suspended, and it resumes when the org tops up.
 *
 * These are worker-tick entrypoints. Every function is idempotent, safe under
 * concurrent invocation (per-agent `FOR UPDATE` serialization), and never
 * throws on a single-agent failure — it logs and moves on, mirroring
 * `wakeDueAgents`.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { systemClock, type Clock } from "@/lib/time";
import { balanceForOrg } from "@/modules/billing/credit-service";

type Db = ReturnType<typeof getDb>;

/** Standby fee per active agent-hour, in integer minor units ($0.01/h). */
export const AGENT_STANDBY_MINOR_PER_HOUR = 1;

const MAX_AGENTS_PER_BILLING_TICK = 200;

/** UTC hour bucket `yyyy-mm-ddThh` — the granularity of standby charging. */
export function hourBucket(date: Date): string {
  return date.toISOString().slice(0, 13);
}

/** Deterministic ledger ref for one agent's standby charge in one hour. */
export function standbyRefId(agentInstanceId: string, hour: string): string {
  return `agent:${agentInstanceId}:standby:${hour}`;
}

/**
 * Charge one standby fee per active agent per UTC hour. The `FOR UPDATE` lock
 * on the agent row serializes concurrent ticks; the check-then-insert against
 * the deterministic `refId` makes the charge exactly-once even across restarts.
 * Standby charges carry no `jobId`, so they sit outside the one-charge-per-job
 * unique index by construction.
 */
export async function chargeAgentStandby(db: Db = getDb(), clock: Clock = systemClock): Promise<number> {
  const hour = hourBucket(clock.now());
  const candidates = await db
    .select({ id: schema.agentInstances.id })
    .from(schema.agentInstances)
    .where(eq(schema.agentInstances.status, "active"))
    .limit(MAX_AGENTS_PER_BILLING_TICK);

  let charged = 0;
  for (const { id } of candidates) {
    try {
      const didCharge = await db.transaction(async (tx) => {
        const [agent] = await tx
          .select()
          .from(schema.agentInstances)
          .where(eq(schema.agentInstances.id, id))
          .for("update")
          .limit(1);
        if (!agent || agent.status !== "active") return false;

        const refId = standbyRefId(agent.id, hour);
        const [existing] = await tx
          .select({ id: schema.usageLedgerEntries.id })
          .from(schema.usageLedgerEntries)
          .where(
            and(
              eq(schema.usageLedgerEntries.organizationId, agent.organizationId),
              eq(schema.usageLedgerEntries.kind, "charge"),
              eq(schema.usageLedgerEntries.refType, "agent_instance"),
              eq(schema.usageLedgerEntries.refId, refId),
            ),
          )
          .limit(1);
        if (existing) return false;

        await tx.insert(schema.usageLedgerEntries).values({
          organizationId: agent.organizationId,
          direction: "debit",
          kind: "charge",
          amountMinor: AGENT_STANDBY_MINOR_PER_HOUR,
          currency: agent.currency,
          description: "Hosted-agent standby",
          refType: "agent_instance",
          refId,
        });
        return true;
      });
      if (didCharge) charged += 1;
    } catch (error) {
      logger.error("agent standby charge failed", { agentInstanceId: id, error: String(error) });
    }
  }
  return charged;
}

/** Best-effort audit row for a billing state change (never throws). */
async function auditAgentBilling(
  tx: Db,
  agent: typeof schema.agentInstances.$inferSelect,
  action: string,
): Promise<void> {
  try {
    await tx.insert(schema.auditEvents).values({
      organizationId: agent.organizationId,
      action,
      resourceType: "agent_instance",
      resourceId: agent.id,
      after: { status: action.endsWith("suspended") ? "suspended" : "active" },
    });
  } catch (error) {
    logger.warn("agent billing audit write failed", { agentInstanceId: agent.id, error: String(error) });
  }
}

/**
 * Suspend every active agent whose org balance has dropped to zero or below —
 * the hard ceiling. Idempotent (already-suspended agents are skipped) and
 * concurrency-safe (per-agent `FOR UPDATE`).
 */
export async function suspendUnfundedAgents(db: Db = getDb()): Promise<number> {
  const candidates = await db
    .select({ id: schema.agentInstances.id })
    .from(schema.agentInstances)
    .where(eq(schema.agentInstances.status, "active"))
    .limit(MAX_AGENTS_PER_BILLING_TICK);

  let suspended = 0;
  for (const { id } of candidates) {
    try {
      const didSuspend = await db.transaction(async (tx) => {
        const [agent] = await tx
          .select()
          .from(schema.agentInstances)
          .where(eq(schema.agentInstances.id, id))
          .for("update")
          .limit(1);
        if (!agent || agent.status !== "active") return false;
        if ((await balanceForOrg(agent.organizationId, agent.currency, tx)) > 0) return false;

        await tx
          .update(schema.agentInstances)
          .set({ status: "suspended", nextWakeAt: null })
          .where(eq(schema.agentInstances.id, agent.id));
        await auditAgentBilling(tx, agent, "hosted_agent.suspended");
        return true;
      });
      if (didSuspend) suspended += 1;
    } catch (error) {
      logger.error("agent suspend failed", { agentInstanceId: id, error: String(error) });
    }
  }
  return suspended;
}

/**
 * Resume agents suspended for lack of funds once their org balance is positive
 * again. Heartbeat agents get their next wake scheduled; message-driven agents
 * wake on the next inbound message. Idempotent + concurrency-safe.
 *
 * Note: this only reverses billing suspensions, which is correct because a
 * tenant-initiated pause uses a different status path — a `suspended` agent is
 * by definition unfunded, and funding is the sole gate here.
 */
export async function resumeFundedAgents(db: Db = getDb(), clock: Clock = systemClock): Promise<number> {
  const candidates = await db
    .select({ id: schema.agentInstances.id })
    .from(schema.agentInstances)
    .where(eq(schema.agentInstances.status, "suspended"))
    .limit(MAX_AGENTS_PER_BILLING_TICK);

  let resumed = 0;
  for (const { id } of candidates) {
    try {
      const didResume = await db.transaction(async (tx) => {
        const [agent] = await tx
          .select()
          .from(schema.agentInstances)
          .where(eq(schema.agentInstances.id, id))
          .for("update")
          .limit(1);
        if (!agent || agent.status !== "suspended") return false;
        if ((await balanceForOrg(agent.organizationId, agent.currency, tx)) <= 0) return false;

        const nextWakeAt = agent.wakeIntervalMinutes
          ? new Date(clock.now().getTime() + agent.wakeIntervalMinutes * 60_000)
          : null;
        await tx
          .update(schema.agentInstances)
          .set({ status: "active", nextWakeAt })
          .where(eq(schema.agentInstances.id, agent.id));
        await auditAgentBilling(tx, agent, "hosted_agent.resumed");
        return true;
      });
      if (didResume) resumed += 1;
    } catch (error) {
      logger.error("agent resume failed", { agentInstanceId: id, error: String(error) });
    }
  }
  return resumed;
}
