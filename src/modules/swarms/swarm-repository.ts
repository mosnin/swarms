/**
 * Swarm reads (Postgres-backed). Fetches a swarm run and its per-worker rows,
 * and rolls up the workers' execution logs. Swarms are created by the
 * agent-workforce path (see spawn-swarm.ts).
 */

import { and, asc, desc, eq, lt } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { requireOrganization, requirePermission, type AuthContext } from "@/modules/identity/access-control";

type Db = ReturnType<typeof getDb>;

export interface SwarmRunView {
  id: string;
  status: string;
  objective: string;
  costMinor: number;
  costCurrency: string;
  output: unknown;
  agents: Array<{ role: string; status: string; jobId: string | null; costMinor: number; output: unknown; error: unknown }>;
  createdAt: string;
}

export interface SwarmRunSummary {
  id: string;
  status: string;
  objective: string;
  workerCount: number;
  costMinor: number;
  costCurrency: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface ListSwarmRunsOptions {
  status?: string;
  limit?: number;
  cursor?: string; // id of last item on previous page (cursor-based pagination)
}

export async function listSwarmRuns(
  ctx: AuthContext,
  opts: ListSwarmRunsOptions = {},
  db: Db = getDb(),
): Promise<{ runs: SwarmRunSummary[]; nextCursor: string | null }> {
  requirePermission(ctx, "jobs.read");

  const limit = Math.min(opts.limit ?? 20, 100);

  const conditions = [eq(schema.swarmRuns.organizationId, ctx.organizationId)];
  if (opts.status) {
    conditions.push(eq(schema.swarmRuns.status, opts.status as never));
  }
  if (opts.cursor) {
    // Fetch runs created before the cursor item (descending order).
    const cursorRun = (
      await db
        .select({ createdAt: schema.swarmRuns.createdAt })
        .from(schema.swarmRuns)
        .where(eq(schema.swarmRuns.id, opts.cursor))
        .limit(1)
    )[0];
    if (cursorRun) {
      conditions.push(lt(schema.swarmRuns.createdAt, cursorRun.createdAt));
    }
  }

  const rows = await db
    .select()
    .from(schema.swarmRuns)
    .where(and(...conditions))
    .orderBy(desc(schema.swarmRuns.createdAt))
    .limit(limit + 1); // fetch one extra to detect next page

  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;

  const runs: SwarmRunSummary[] = page.map((r) => ({
    id: r.id,
    status: r.status,
    objective: (r.input as { objective?: string })?.objective ?? "",
    workerCount: (r.input as { workerCount?: number })?.workerCount ?? 0,
    costMinor: r.costMinor,
    costCurrency: r.costCurrency,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));

  return {
    runs,
    nextCursor: hasNext && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function getSwarmRun(ctx: AuthContext, swarmRunId: string, db: Db = getDb()): Promise<SwarmRunView> {
  requirePermission(ctx, "jobs.read");
  const run = (
    await db.select().from(schema.swarmRuns).where(eq(schema.swarmRuns.id, swarmRunId)).limit(1)
  )[0];
  if (!run) throw Errors.notFound("Swarm run not found");
  requireOrganization(ctx, run.organizationId);

  const agentRows = await db
    .select()
    .from(schema.swarmAgents)
    .where(eq(schema.swarmAgents.swarmRunId, swarmRunId))
    .orderBy(asc(schema.swarmAgents.createdAt));

  return {
    id: run.id,
    status: run.status,
    objective: (run.input as { objective?: string })?.objective ?? "",
    costMinor: run.costMinor,
    costCurrency: run.costCurrency,
    output: run.output,
    agents: agentRows.map((a) => ({
      role: a.role,
      status: a.status,
      jobId: a.jobId,
      costMinor: a.costMinor,
      output: a.output,
      error: a.error,
    })),
    createdAt: run.createdAt.toISOString(),
  };
}

export async function getSwarmLogs(ctx: AuthContext, swarmRunId: string, db: Db = getDb()) {
  requirePermission(ctx, "jobs.read");
  const run = (
    await db.select().from(schema.swarmRuns).where(eq(schema.swarmRuns.id, swarmRunId)).limit(1)
  )[0];
  if (!run) throw Errors.notFound("Swarm run not found");
  requireOrganization(ctx, run.organizationId);

  const agentRows = await db
    .select({ jobId: schema.swarmAgents.jobId, role: schema.swarmAgents.role })
    .from(schema.swarmAgents)
    .where(eq(schema.swarmAgents.swarmRunId, swarmRunId));

  const logs: Array<{ role: string; level: string; message: string; loggedAt: string }> = [];
  for (const agent of agentRows) {
    if (!agent.jobId) continue;
    const jobLogs = await db
      .select()
      .from(schema.executionLogs)
      .where(
        and(
          eq(schema.executionLogs.jobId, agent.jobId),
          eq(schema.executionLogs.organizationId, ctx.organizationId),
        ),
      )
      .orderBy(asc(schema.executionLogs.loggedAt));
    for (const l of jobLogs) {
      logs.push({ role: agent.role, level: l.level, message: l.message, loggedAt: l.loggedAt.toISOString() });
    }
  }
  return logs;
}
