/**
 * Hosted-agent service (docs/HOSTED_AGENTS.md Phase 1). A hosted agent is a
 * durable identity in Postgres; execution is discrete wake jobs through the
 * normal spawn path, so every wake is policy-gated, hard-ceiling reserved,
 * and exactly-once charged. Wakes are triggered by inbound messages
 * (immediately) or an optional heartbeat interval, claimed with the same CAS
 * pattern as schedule firings so concurrent workers never double-wake.
 */

import { and, asc, count, desc, eq, isNull, like, lte, sum } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { systemClock, type Clock } from "@/lib/time";
import {
  agentContext,
  requirePermission,
  requireOrganization,
  userContext,
  type AuthContext,
} from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { spawnAgent } from "@/modules/agents/spawn-service";
import { storeResourceBundle, type ResourceBundle } from "@/modules/resources/resource-bundle";

type Db = ReturnType<typeof getDb>;
type InstanceRow = typeof schema.agentInstances.$inferSelect;
type MessageRow = typeof schema.agentMessages.$inferSelect;

const MAX_WAKES_PER_TICK = 10;
const MAX_MESSAGES_PER_WAKE = 20;
const MAX_HISTORY_ENTRIES = 40;
const MIN_WAKE_INTERVAL_MINUTES = 5;

/** Durable memory shape stored in `agentInstances.state`. */
interface AgentState {
  history?: Array<{ at: string; role: string; content: string }>;
  lastAppliedJobId?: string;
}

export interface AgentInstanceView {
  id: string;
  name: string;
  template: string;
  instructions: string;
  model: string;
  status: InstanceRow["status"];
  wakeIntervalMinutes: number | null;
  nextWakeAt: Date | null;
  lastWakeAt: Date | null;
  lastJobId: string | null;
  budgetMinorPerWake: number;
  currency: string;
  stateVersion: number;
  createdAt: Date;
}

export interface AgentMessageView {
  id: string;
  role: string;
  content: string;
  jobId: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

function toView(row: InstanceRow): AgentInstanceView {
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    instructions: row.instructions,
    model: row.model,
    status: row.status,
    wakeIntervalMinutes: row.wakeIntervalMinutes,
    nextWakeAt: row.nextWakeAt,
    lastWakeAt: row.lastWakeAt,
    lastJobId: row.lastJobId,
    budgetMinorPerWake: row.budgetMinorPerWake,
    currency: row.currency,
    stateVersion: row.stateVersion,
    createdAt: row.createdAt,
  };
}

function toMessageView(row: MessageRow): AgentMessageView {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    jobId: row.jobId,
    processedAt: row.processedAt,
    createdAt: row.createdAt,
  };
}

async function loadOwned(ctx: AuthContext, id: string, db: Db): Promise<InstanceRow> {
  const [row] = await db
    .select()
    .from(schema.agentInstances)
    .where(eq(schema.agentInstances.id, id))
    .limit(1);
  if (!row || row.status === "terminated") throw Errors.notFound("Agent not found");
  requireOrganization(ctx, row.organizationId);
  return row;
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

export interface CreateAgentInstanceInput {
  name: string;
  instructions: string;
  model?: string;
  wakeIntervalMinutes?: number | null;
  budgetMinorPerWake?: number;
  resources?: ResourceBundle;
}

export async function createAgentInstance(
  ctx: AuthContext,
  input: CreateAgentInstanceInput,
  db: Db = getDb(),
  clock: Clock = systemClock,
): Promise<AgentInstanceView> {
  requirePermission(ctx, "jobs.create");

  if (input.wakeIntervalMinutes != null && input.wakeIntervalMinutes < MIN_WAKE_INTERVAL_MINUTES) {
    throw Errors.validation(`wakeIntervalMinutes must be at least ${MIN_WAKE_INTERVAL_MINUTES}`);
  }
  const rate = env.GPU_RATE_MINOR_PER_SECOND ?? 2;
  const budgetMinorPerWake = input.budgetMinorPerWake ?? 100;
  if (rate > 0 && budgetMinorPerWake < rate) {
    throw Errors.validation(
      `budgetMinorPerWake is too low: at least ${rate} minor units are required per wake`,
    );
  }

  const createdByUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  const resourceBundleId = input.resources
    ? await storeResourceBundle(ctx.organizationId, input.resources, createdByUserId, db)
    : null;

  const now = clock.now();
  const [row] = await db
    .insert(schema.agentInstances)
    .values({
      organizationId: ctx.organizationId,
      createdByUserId,
      apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
      name: input.name,
      instructions: input.instructions,
      model: input.model ?? env.AGENT_DEFAULT_MODEL ?? "deepseek/deepseek-chat-v4",
      wakeIntervalMinutes: input.wakeIntervalMinutes ?? null,
      nextWakeAt: input.wakeIntervalMinutes
        ? new Date(now.getTime() + input.wakeIntervalMinutes * 60_000)
        : null,
      budgetMinorPerWake,
      currency: "USD",
      resourceBundleId,
    })
    .returning();
  if (!row) throw Errors.internal("Failed to create agent instance");

  await writeAudit(
    ctx,
    {
      action: "hosted_agent.created",
      resourceType: "agent_instance",
      resourceId: row.id,
      after: { name: row.name, model: row.model, budgetMinorPerWake },
    },
    db,
  );
  return toView(row);
}

export async function listAgentInstances(ctx: AuthContext, db: Db = getDb()): Promise<AgentInstanceView[]> {
  requirePermission(ctx, "jobs.read");
  const rows = await db
    .select()
    .from(schema.agentInstances)
    .where(eq(schema.agentInstances.organizationId, ctx.organizationId))
    .orderBy(desc(schema.agentInstances.createdAt));
  return rows.filter((r) => r.status !== "terminated").map(toView);
}

export interface AgentSpend {
  totalSpendMinor: number;
  wakeCount: number;
  currency: string;
}

export async function getAgentInstance(
  ctx: AuthContext,
  id: string,
  db: Db = getDb(),
): Promise<{ agent: AgentInstanceView; messages: AgentMessageView[]; spend: AgentSpend }> {
  requirePermission(ctx, "jobs.read");
  const row = await loadOwned(ctx, id, db);
  const [messages, spendRows] = await Promise.all([
    db
      .select()
      .from(schema.agentMessages)
      .where(eq(schema.agentMessages.agentInstanceId, row.id))
      .orderBy(desc(schema.agentMessages.createdAt))
      .limit(50),
    // Wake jobs are linked by their deterministic idempotency-key prefix
    // (`agent:{id}:wake:{claimedAt}`), so spend attribution needs no extra column.
    db
      .select({ total: sum(schema.jobs.costMinor), c: count() })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.organizationId, row.organizationId),
          like(schema.jobs.idempotencyKey, `agent:${row.id}:wake:%`),
        ),
      ),
  ]);
  return {
    agent: toView(row),
    messages: messages.reverse().map(toMessageView),
    spend: {
      totalSpendMinor: Number(spendRows[0]?.total ?? 0),
      wakeCount: spendRows[0]?.c ?? 0,
      currency: row.currency,
    },
  };
}

export async function setAgentInstanceStatus(
  ctx: AuthContext,
  id: string,
  status: "active" | "paused",
  db: Db = getDb(),
  clock: Clock = systemClock,
): Promise<AgentInstanceView> {
  requirePermission(ctx, "jobs.create");
  const row = await loadOwned(ctx, id, db);
  if (row.status === "suspended") {
    throw Errors.conflict("A suspended agent can only be reinstated by the platform");
  }

  const now = clock.now();
  const nextWakeAt =
    status === "active" && row.wakeIntervalMinutes
      ? new Date(now.getTime() + row.wakeIntervalMinutes * 60_000)
      : null;
  const [updated] = await db
    .update(schema.agentInstances)
    .set({ status, nextWakeAt })
    .where(eq(schema.agentInstances.id, row.id))
    .returning();
  if (!updated) throw Errors.internal("Failed to update agent");

  await writeAudit(
    ctx,
    { action: `hosted_agent.${status === "active" ? "resumed" : "paused"}`, resourceType: "agent_instance", resourceId: id },
    db,
  );
  return toView(updated);
}

export async function terminateAgentInstance(ctx: AuthContext, id: string, db: Db = getDb()): Promise<void> {
  requirePermission(ctx, "jobs.create");
  const row = await loadOwned(ctx, id, db);
  await db
    .update(schema.agentInstances)
    .set({ status: "terminated", nextWakeAt: null })
    .where(eq(schema.agentInstances.id, row.id));
  await writeAudit(
    ctx,
    { action: "hosted_agent.terminated", resourceType: "agent_instance", resourceId: id },
    db,
  );
}

/* ------------------------------------------------------------------ */
/* Messaging                                                           */
/* ------------------------------------------------------------------ */

/**
 * Deliver an inbound message to the agent and schedule an immediate wake.
 * The message is processed by the next worker tick as a normal charged job.
 */
export async function postAgentMessage(
  ctx: AuthContext,
  id: string,
  content: string,
  db: Db = getDb(),
  clock: Clock = systemClock,
): Promise<AgentMessageView> {
  requirePermission(ctx, "jobs.create");
  const row = await loadOwned(ctx, id, db);
  if (row.status !== "active") {
    throw Errors.conflict(`Agent is ${row.status}; resume it before sending messages`);
  }
  if (!content || content.trim().length === 0) throw Errors.validation("content is required");
  if (content.length > 8_000) throw Errors.validation("content exceeds the 8000-character limit");

  const [message] = await db
    .insert(schema.agentMessages)
    .values({
      organizationId: row.organizationId,
      agentInstanceId: row.id,
      role: "user",
      content: content.trim(),
    })
    .returning();
  if (!message) throw Errors.internal("Failed to record message");

  // Wake ASAP: pull nextWakeAt forward (never push it back).
  const now = clock.now();
  if (!row.nextWakeAt || row.nextWakeAt > now) {
    await db
      .update(schema.agentInstances)
      .set({ nextWakeAt: now })
      .where(eq(schema.agentInstances.id, row.id));
  }
  return toMessageView(message);
}

/* ------------------------------------------------------------------ */
/* Wake loop (worker tick)                                             */
/* ------------------------------------------------------------------ */

/** The principal a wake runs as — mirrors contextForSchedule. */
function contextForInstance(row: InstanceRow): AuthContext {
  if (row.apiKeyId) {
    return agentContext({
      organizationId: row.organizationId,
      apiKeyId: row.apiKeyId,
      userId: row.createdByUserId ?? null,
      scopes: ["jobs.create", "jobs.read"],
    });
  }
  return userContext({
    organizationId: row.organizationId,
    userId: row.createdByUserId ?? "system",
    membershipId: "hosted-agent",
    role: "operator",
  });
}

function composeWakeTask(row: InstanceRow, pending: MessageRow[]): string {
  const state = (row.state ?? {}) as AgentState;
  const history = (state.history ?? []).slice(-10);
  const parts: string[] = [
    `You are "${row.name}", a persistent hosted agent.`,
    `Standing instructions:\n${row.instructions}`,
  ];
  if (history.length > 0) {
    parts.push(
      `Recent memory (oldest first):\n${history.map((h) => `[${h.role}] ${h.content}`).join("\n")}`,
    );
  }
  if (pending.length > 0) {
    parts.push(
      `New messages to handle:\n${pending.map((m) => `- ${m.content}`).join("\n")}`,
      "Respond to these messages in line with your standing instructions.",
    );
  } else {
    parts.push("This is a scheduled heartbeat wake. Act on your standing instructions.");
  }
  return parts.join("\n\n");
}

/**
 * Worker entrypoint: wake every active agent whose `nextWakeAt` is due.
 * Claiming is a CAS on `nextWakeAt` (same pattern as runDueSchedules) so
 * concurrent workers never double-wake — and therefore never double-charge.
 */
export async function wakeDueAgents(db: Db = getDb(), clock: Clock = systemClock): Promise<number> {
  const now = clock.now();
  const due = await db
    .select()
    .from(schema.agentInstances)
    .where(and(eq(schema.agentInstances.status, "active"), lte(schema.agentInstances.nextWakeAt, now)))
    .orderBy(asc(schema.agentInstances.nextWakeAt))
    .limit(MAX_WAKES_PER_TICK);

  let woken = 0;
  for (const row of due) {
    const claimedFor = row.nextWakeAt;
    if (!claimedFor) continue;
    const next = row.wakeIntervalMinutes
      ? new Date(now.getTime() + row.wakeIntervalMinutes * 60_000)
      : null;

    // CAS the advance first: one worker wins, losers skip.
    const claimed = await db
      .update(schema.agentInstances)
      .set({ nextWakeAt: next, lastWakeAt: now })
      .where(
        and(eq(schema.agentInstances.id, row.id), eq(schema.agentInstances.nextWakeAt, claimedFor)),
      )
      .returning({ id: schema.agentInstances.id });
    if (claimed.length === 0) continue;

    try {
      const pending = await db
        .select()
        .from(schema.agentMessages)
        .where(
          and(
            eq(schema.agentMessages.agentInstanceId, row.id),
            eq(schema.agentMessages.role, "user"),
            isNull(schema.agentMessages.processedAt),
          ),
        )
        .orderBy(asc(schema.agentMessages.createdAt))
        .limit(MAX_MESSAGES_PER_WAKE);

      // Nothing to do and no heartbeat semantics? Skip silently (no charge).
      if (pending.length === 0 && !row.wakeIntervalMinutes) continue;

      const ctx = contextForInstance(row);
      const res = await spawnAgent(
        ctx,
        {
          task: composeWakeTask(row, pending),
          model: row.model,
          budgetMinor: row.budgetMinorPerWake,
          currency: row.currency,
          idempotencyKey: `agent:${row.id}:wake:${claimedFor.toISOString()}`,
        },
        db,
      );

      if (pending.length > 0) {
        for (const m of pending) {
          await db
            .update(schema.agentMessages)
            .set({ processedAt: now, jobId: res.jobId })
            .where(eq(schema.agentMessages.id, m.id));
        }
      }
      await db
        .update(schema.agentInstances)
        .set({ lastJobId: res.jobId })
        .where(eq(schema.agentInstances.id, row.id));
      woken += 1;
    } catch (error) {
      // A failed wake (budget exhausted, policy deny) must not wedge the agent;
      // heartbeat agents retry at the next interval, message-driven agents on
      // the next inbound message. Suspension-on-repeated-failure is Phase 2.
      const message = error instanceof Error ? error.message : String(error);
      logger.error("hosted agent wake failed", { agentInstanceId: row.id, error: message });
    }
  }
  return woken;
}

/**
 * Worker entrypoint: fold completed wake-job outputs back into durable memory
 * and the message thread. Idempotent via `state.lastAppliedJobId` CAS on
 * `stateVersion`, so a crash between steps re-applies safely.
 */
export async function applyCompletedWakes(db: Db = getDb(), clock: Clock = systemClock): Promise<number> {
  const candidates = await db
    .select()
    .from(schema.agentInstances)
    .where(eq(schema.agentInstances.status, "active"))
    .limit(100);

  let applied = 0;
  for (const row of candidates) {
    if (!row.lastJobId) continue;
    const state = (row.state ?? {}) as AgentState;
    if (state.lastAppliedJobId === row.lastJobId) continue;

    const [job] = await db
      .select({ id: schema.jobs.id, status: schema.jobs.status, output: schema.jobs.output })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, row.lastJobId))
      .limit(1);
    if (!job || (job.status !== "succeeded" && job.status !== "failed")) continue;

    const outputText =
      job.status === "failed"
        ? "(wake failed — see job logs)"
        : typeof job.output === "string"
          ? job.output
          : JSON.stringify(job.output ?? "").slice(0, 4_000);

    const consumed = await db
      .select()
      .from(schema.agentMessages)
      .where(eq(schema.agentMessages.jobId, job.id));

    const newHistory = [
      ...(state.history ?? []),
      ...consumed
        .filter((m) => m.role === "user")
        .map((m) => ({ at: m.createdAt.toISOString(), role: "user", content: m.content.slice(0, 1_000) })),
      { at: clock.now().toISOString(), role: "agent", content: outputText.slice(0, 1_000) },
    ].slice(-MAX_HISTORY_ENTRIES);

    // CAS on stateVersion: a concurrent writer loses cleanly and retries next tick.
    const updated = await db
      .update(schema.agentInstances)
      .set({
        state: { ...state, history: newHistory, lastAppliedJobId: job.id },
        stateVersion: row.stateVersion + 1,
      })
      .where(
        and(
          eq(schema.agentInstances.id, row.id),
          eq(schema.agentInstances.stateVersion, row.stateVersion),
        ),
      )
      .returning({ id: schema.agentInstances.id });
    if (updated.length === 0) continue;

    // The agent's reply becomes a visible thread message (idempotent per job).
    const existingReply = consumed.find((m) => m.role === "agent");
    if (!existingReply && job.status === "succeeded") {
      await db.insert(schema.agentMessages).values({
        organizationId: row.organizationId,
        agentInstanceId: row.id,
        role: "agent",
        content: outputText,
        jobId: job.id,
        processedAt: clock.now(),
      });
    }
    applied += 1;
  }
  return applied;
}
