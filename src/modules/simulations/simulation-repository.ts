/**
 * Simulation reads (Postgres-backed). Fetches a simulation run and its
 * per-persona rows, and lists an org's runs with cursor pagination. Runs are
 * created by the simulation service (see simulation-service.ts).
 */

import { and, asc, desc, eq, lt } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { requireOrganization, requirePermission, type AuthContext } from "@/modules/identity/access-control";

type Db = ReturnType<typeof getDb>;

export interface SimulationRunView {
  id: string;
  status: string;
  mode: string;
  frameworkId: string | null;
  objective: string;
  costMinor: number;
  baseFeeMinor: number;
  gpuSeconds: number;
  costCurrency: string;
  output: unknown;
  agents: Array<{ personaName: string; role: string | null; status: string; output: unknown; error: unknown }>;
  createdAt: string;
  finishedAt: string | null;
}

export interface SimulationRunSummary {
  id: string;
  status: string;
  mode: string;
  frameworkId: string | null;
  objective: string;
  agentCount: number;
  costMinor: number;
  costCurrency: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface ListSimulationRunsOptions {
  status?: string;
  limit?: number;
  cursor?: string;
}

export async function listSimulationRuns(
  ctx: AuthContext,
  opts: ListSimulationRunsOptions = {},
  db: Db = getDb(),
): Promise<{ runs: SimulationRunSummary[]; nextCursor: string | null }> {
  requirePermission(ctx, "jobs.read");

  const limit = Math.min(opts.limit ?? 20, 100);
  const conditions = [eq(schema.simulationRuns.organizationId, ctx.organizationId)];
  if (opts.status) conditions.push(eq(schema.simulationRuns.status, opts.status as never));
  if (opts.cursor) {
    const cursorRun = (
      await db
        .select({ createdAt: schema.simulationRuns.createdAt })
        .from(schema.simulationRuns)
        .where(eq(schema.simulationRuns.id, opts.cursor))
        .limit(1)
    )[0];
    if (cursorRun) conditions.push(lt(schema.simulationRuns.createdAt, cursorRun.createdAt));
  }

  const rows = await db
    .select()
    .from(schema.simulationRuns)
    .where(and(...conditions))
    .orderBy(desc(schema.simulationRuns.createdAt))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;

  const runs: SimulationRunSummary[] = page.map((r) => ({
    id: r.id,
    status: r.status,
    mode: r.mode,
    frameworkId: r.frameworkId ?? null,
    objective: (r.input as { objective?: string })?.objective ?? "",
    agentCount: (r.input as { agentCount?: number })?.agentCount ?? 0,
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

export async function getSimulationRun(
  ctx: AuthContext,
  simulationRunId: string,
  db: Db = getDb(),
): Promise<SimulationRunView> {
  requirePermission(ctx, "jobs.read");
  const run = (
    await db.select().from(schema.simulationRuns).where(eq(schema.simulationRuns.id, simulationRunId)).limit(1)
  )[0];
  if (!run) throw Errors.notFound("Simulation run not found");
  requireOrganization(ctx, run.organizationId);

  const agentRows = await db
    .select()
    .from(schema.simulationAgents)
    .where(eq(schema.simulationAgents.simulationRunId, simulationRunId))
    .orderBy(asc(schema.simulationAgents.createdAt));

  return {
    id: run.id,
    status: run.status,
    mode: run.mode,
    frameworkId: run.frameworkId ?? null,
    objective: (run.input as { objective?: string })?.objective ?? "",
    costMinor: run.costMinor,
    baseFeeMinor: run.baseFeeMinor,
    gpuSeconds: run.gpuSeconds,
    costCurrency: run.costCurrency,
    output: run.output,
    agents: agentRows.map((a) => ({
      personaName: a.personaName,
      role: a.role,
      status: a.status,
      output: a.output,
      error: a.error,
    })),
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}
