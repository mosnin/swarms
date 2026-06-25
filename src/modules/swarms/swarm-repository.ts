/**
 * Swarm reads (Postgres-backed). Fetches a swarm run and its per-worker rows,
 * and rolls up the workers' execution logs. Swarms are created by the
 * agent-workforce path (see spawn-swarm.ts).
 */

import { and, asc, eq } from "drizzle-orm";

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
