/**
 * cancelSwarm — abort an in-progress swarm run.
 *
 * Marks the run and all non-terminal worker agents as "cancelled", then
 * releases any outstanding budget holds so the org's headroom is restored.
 * Idempotent: runs already in a terminal state (succeeded / failed / cancelled)
 * are returned as-is without modification.
 */

import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { requireOrganization, requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { releaseBudget } from "@/server/budget/releaseBudget";

type Db = ReturnType<typeof getDb>;

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

export interface CancelSwarmResult {
  swarmRunId: string;
  status: string;
  cancelledAgents: number;
  releasedMinor: number;
  workers: Array<{ id: string; role: string; status: string }>;
  message?: string;
}

export async function cancelSwarm(
  ctx: AuthContext,
  swarmRunId: string,
  db: Db = getDb(),
): Promise<CancelSwarmResult> {
  requirePermission(ctx, "jobs.create");

  const run = (
    await db
      .select()
      .from(schema.swarmRuns)
      .where(
        and(
          eq(schema.swarmRuns.id, swarmRunId),
          eq(schema.swarmRuns.organizationId, ctx.organizationId),
        ),
      )
      .limit(1)
  )[0];

  if (!run) throw Errors.notFound(`Swarm run ${swarmRunId} not found`);
  requireOrganization(ctx, run.organizationId);

  const agents = await db
    .select()
    .from(schema.swarmAgents)
    .where(eq(schema.swarmAgents.swarmRunId, swarmRunId));

  // Already terminal — idempotent no-op.
  if (TERMINAL.has(run.status)) {
    return {
      swarmRunId,
      status: run.status,
      cancelledAgents: 0,
      releasedMinor: 0,
      workers: agents.map((a) => ({ id: a.id, role: a.role, status: a.status })),
      message: `Swarm already in terminal state: ${run.status}`,
    };
  }

  const inFlightAgents = agents.filter((a) => !TERMINAL.has(a.status));

  if (inFlightAgents.length > 0) {
    await db
      .update(schema.swarmAgents)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(schema.swarmAgents.swarmRunId, swarmRunId),
          or(
            eq(schema.swarmAgents.status, "queued"),
            eq(schema.swarmAgents.status, "running"),
            eq(schema.swarmAgents.status, "awaiting_payment"),
            eq(schema.swarmAgents.status, "awaiting_approval"),
          ),
        ),
      );

    for (const agent of inFlightAgents) {
      if (agent.jobId) {
        // Best-effort: one bad release must not block the rest.
        await releaseBudget(
          { organizationId: ctx.organizationId, jobId: agent.jobId, currency: agent.costCurrency },
          db,
        ).catch(() => undefined);
      }
    }
  }

  await db
    .update(schema.swarmRuns)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(eq(schema.swarmRuns.id, swarmRunId));

  await writeAudit(
    ctx,
    {
      action: "swarm.cancelled",
      resourceType: "swarm_run",
      resourceId: swarmRunId,
      after: { cancelledAgents: inFlightAgents.length },
    },
    db,
  );

  return {
    swarmRunId,
    status: "cancelled",
    cancelledAgents: inFlightAgents.length,
    releasedMinor: inFlightAgents.reduce((s, a) => s + a.costMinor, 0),
    workers: agents.map((a) => ({
      id: a.id,
      role: a.role,
      status: TERMINAL.has(a.status) ? a.status : "cancelled",
    })),
  };
}
