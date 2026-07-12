/**
 * Schedule service — cron for agents. A schedule stores a request body and a
 * cron expression; on each firing the worker enqueues that request as a normal
 * agent job / swarm / simulation, so scheduled runs inherit the entire hardened
 * spine (budget ceilings, policy gate, append-only ledger, webhooks).
 *
 * Exactly-once firing without a long-held lock: the per-firing idempotency key
 * (`<scheduleId>-<firedForISO>`) means two workers that pick up the same due
 * schedule produce ONE run (the second create is an idempotent replay), and a
 * compare-and-swap on `nextRunAt` means only one of them advances the counter.
 */

import { and, asc, eq, lte } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { Errors } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  agentContext,
  requireOrganization,
  requirePermission,
  userContext,
  type AuthContext,
} from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { spawnAgent } from "@/modules/agents/spawn-service";
import { enqueueSwarm } from "@/modules/swarms/spawn-swarm";
import { enqueueSimulation } from "@/modules/simulations/simulation-service";
import { simulationConfigSchema } from "@/modules/simulations/schema";
import { isValidCron, nextRun } from "@/server/schedules/cron";
import { systemClock, type Clock } from "@/lib/time";

type Db = ReturnType<typeof getDb>;

const MAX_DUE_PER_TICK = 25;

/** Per-kind request validation (the stored body, minus the per-firing key). */
const agentRequestSchema = z.object({
  task: z.string().min(1).max(20_000),
  resources: z.unknown().optional(),
  model: z.string().max(96).optional(),
  budgetMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  callbackUrl: z.string().url().optional(),
});

const swarmRequestSchema = z
  .object({
    tasks: z.array(z.string().min(1).max(20_000)).min(1).max(16).optional(),
    templateId: z.string().optional(),
    objective: z.string().max(2_000).optional(),
    resources: z.unknown().optional(),
    model: z.string().max(96).optional(),
    budgetMinor: z.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    aggregatorTask: z.string().max(20_000).optional(),
    sequential: z.boolean().optional(),
    callbackUrl: z.string().url().optional(),
  })
  .refine((d) => d.templateId !== undefined || (d.tasks !== undefined && d.tasks.length > 0), {
    message: "Provide tasks or templateId",
  });

export type ScheduleKind = "agent" | "swarm" | "simulation";

export interface CreateScheduleInput {
  name: string;
  kind: ScheduleKind;
  cronExpression: string;
  request: unknown;
  timezone?: string;
}

export interface ScheduleView {
  id: string;
  name: string;
  kind: string;
  cronExpression: string;
  timezone: string;
  status: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunRef: string | null;
  lastError: string | null;
  runCount: number;
  createdAt: string;
}

function toView(row: typeof schema.schedules.$inferSelect): ScheduleView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    status: row.status,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastRunRef: row.lastRunRef,
    lastError: row.lastError,
    runCount: row.runCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Validate a schedule's request body for its kind; returns the parsed body. */
function validateRequest(kind: ScheduleKind, request: unknown): unknown {
  if (kind === "agent") return agentRequestSchema.parse(request);
  if (kind === "swarm") return swarmRequestSchema.parse(request);
  return simulationConfigSchema.parse(request);
}

export async function createSchedule(
  ctx: AuthContext,
  input: CreateScheduleInput,
  db: Db = getDb(),
  clock: Clock = systemClock,
): Promise<ScheduleView> {
  requirePermission(ctx, "jobs.create");

  if (!isValidCron(input.cronExpression)) {
    throw Errors.validation(`Invalid cron expression: "${input.cronExpression}" (expected 5 fields, UTC)`);
  }
  try {
    validateRequest(input.kind, input.request);
  } catch (err) {
    throw Errors.validation(
      `Invalid ${input.kind} request for schedule`,
      err instanceof z.ZodError ? { issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) } : undefined,
    );
  }

  const now = clock.now();
  const next = nextRun(input.cronExpression, now);
  if (!next) throw Errors.validation("Cron expression never fires within a year");

  const row = (
    await db
      .insert(schema.schedules)
      .values({
        organizationId: ctx.organizationId,
        createdByUserId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
        apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
        name: input.name,
        kind: input.kind,
        request: input.request as object,
        cronExpression: input.cronExpression,
        timezone: input.timezone ?? "UTC",
        status: "active",
        nextRunAt: next,
      })
      .returning()
  )[0];
  if (!row) throw Errors.internal("Failed to create schedule");

  await writeAudit(
    ctx,
    { action: "schedule.created", resourceType: "schedule", resourceId: row.id, after: { kind: input.kind, cron: input.cronExpression } },
    db,
  );
  return toView(row);
}

export async function listSchedules(ctx: AuthContext, db: Db = getDb()): Promise<ScheduleView[]> {
  requirePermission(ctx, "jobs.read");
  const rows = await db
    .select()
    .from(schema.schedules)
    .where(eq(schema.schedules.organizationId, ctx.organizationId))
    .orderBy(asc(schema.schedules.createdAt));
  return rows.map(toView);
}

async function loadOwned(ctx: AuthContext, id: string, db: Db): Promise<typeof schema.schedules.$inferSelect> {
  const row = (await db.select().from(schema.schedules).where(eq(schema.schedules.id, id)).limit(1))[0];
  if (!row) throw Errors.notFound("Schedule not found");
  requireOrganization(ctx, row.organizationId);
  return row;
}

export async function getSchedule(ctx: AuthContext, id: string, db: Db = getDb()): Promise<ScheduleView> {
  requirePermission(ctx, "jobs.read");
  return toView(await loadOwned(ctx, id, db));
}

/** Pause or resume a schedule. Resuming recomputes nextRunAt from now. */
export async function setScheduleStatus(
  ctx: AuthContext,
  id: string,
  status: "active" | "paused",
  db: Db = getDb(),
  clock: Clock = systemClock,
): Promise<ScheduleView> {
  requirePermission(ctx, "jobs.create");
  const row = await loadOwned(ctx, id, db);
  const patch: Partial<typeof schema.schedules.$inferInsert> = { status };
  if (status === "active") patch.nextRunAt = nextRun(row.cronExpression, clock.now());
  const updated = (
    await db.update(schema.schedules).set(patch).where(eq(schema.schedules.id, id)).returning()
  )[0];
  if (!updated) throw Errors.internal("Failed to update schedule");
  await writeAudit(ctx, { action: `schedule.${status}`, resourceType: "schedule", resourceId: id }, db);
  return toView(updated);
}

export async function deleteSchedule(ctx: AuthContext, id: string, db: Db = getDb()): Promise<void> {
  requirePermission(ctx, "jobs.create");
  const row = await loadOwned(ctx, id, db);
  await db.delete(schema.schedules).where(eq(schema.schedules.id, row.id));
  await writeAudit(ctx, { action: "schedule.deleted", resourceType: "schedule", resourceId: id }, db);
}

/** Build the auth context a firing runs under, from the schedule's principal. */
function contextForSchedule(row: typeof schema.schedules.$inferSelect): AuthContext {
  if (row.apiKeyId) {
    return agentContext({
      organizationId: row.organizationId,
      apiKeyId: row.apiKeyId,
      userId: row.createdByUserId ?? null,
      scopes: ["jobs.create", "jobs.read"],
    });
  }
  // User-owned schedule (or principal since detached): run as an operator-level
  // system context scoped to job creation only.
  return userContext({
    organizationId: row.organizationId,
    userId: row.createdByUserId ?? "system",
    membershipId: "schedule",
    role: "operator",
  });
}

/** Enqueue one firing of a schedule; returns the created run's reference id. */
async function fireSchedule(row: typeof schema.schedules.$inferSelect, firedFor: Date, db: Db): Promise<string> {
  const ctx = contextForSchedule(row);
  const idempotencyKey = `${row.id}-${firedFor.toISOString()}`;
  const request = validateRequest(row.kind as ScheduleKind, row.request) as Record<string, unknown>;

  if (row.kind === "agent") {
    const res = await spawnAgent(ctx, { ...request, idempotencyKey } as never, db);
    return res.jobId;
  }
  if (row.kind === "swarm") {
    const res = await enqueueSwarm(ctx, { ...request, idempotencyKey } as never, db);
    return res.swarmRunId;
  }
  const res = await enqueueSimulation(ctx, { ...request, idempotencyKey } as never, db);
  return res.simulationRunId;
}

/**
 * Worker entrypoint: fire every active schedule whose `nextRunAt` is due. Called
 * on each worker tick. Firing is idempotent per (schedule, minute), and the
 * counter advance is a CAS on `nextRunAt`, so concurrent workers never
 * double-fire or double-count. Returns the number of schedules fired.
 */
export async function runDueSchedules(db: Db = getDb(), clock: Clock = systemClock): Promise<number> {
  const now = clock.now();
  const due = await db
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.status, "active"), lte(schema.schedules.nextRunAt, now)))
    .orderBy(asc(schema.schedules.nextRunAt))
    .limit(MAX_DUE_PER_TICK);

  let fired = 0;
  for (const row of due) {
    const firedFor = row.nextRunAt;
    if (!firedFor) continue;
    const next = nextRun(row.cronExpression, now);

    // CAS the advance FIRST (WHERE next_run_at = firedFor): only one worker wins
    // and will run the enqueue; losers skip. This also prevents a tight re-fire
    // loop if the enqueue is slow.
    const claimed = await db
      .update(schema.schedules)
      .set({ nextRunAt: next, lastRunAt: now, runCount: row.runCount + 1 })
      .where(and(eq(schema.schedules.id, row.id), eq(schema.schedules.nextRunAt, firedFor)))
      .returning({ id: schema.schedules.id });
    if (claimed.length === 0) continue; // another worker claimed this firing

    try {
      const ref = await fireSchedule(row, firedFor, db);
      await db
        .update(schema.schedules)
        .set({ lastRunRef: ref, lastError: null })
        .where(eq(schema.schedules.id, row.id));
      fired += 1;
    } catch (error) {
      // A firing that fails (e.g. budget exceeded, policy deny) must not wedge the
      // schedule — record the error and let the next occurrence try again.
      const message = error instanceof Error ? error.message : String(error);
      logger.error("schedule firing failed", { scheduleId: row.id, error: message });
      await db
        .update(schema.schedules)
        .set({ lastError: message.slice(0, 1_000) })
        .where(eq(schema.schedules.id, row.id));
    }
  }
  return fired;
}
