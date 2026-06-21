/**
 * Swarm orchestration (Postgres-backed). Plans a swarm from a template, creates
 * the run + per-agent rows, executes each agent as a real child job through the
 * existing job system (create → process), enforces the aggregate budget, and
 * merges results into a parent swarm result. Logs roll up the children's logs.
 */

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { requireOrganization, requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { createJob as createJobCore } from "@/modules/execution/job-service";
import { dbJobStore, resolveSkillVersion } from "@/modules/execution/job-repository";
import { processJobInDb } from "@/modules/execution/worker";
import { checkBudget } from "@/server/budget/checkBudget";
import { executeSwarm, type ChildOutcome } from "@/server/swarms/executeSwarm";
import { planSwarm, type PlannedAgent, type SwarmRoleDef } from "@/server/swarms/planSwarm";
import { getJobQueue } from "@/server/queue/queue";

type Db = ReturnType<typeof getDb>;

export interface RunSwarmRequest {
  templateId: string;
  objective: string;
  input?: Record<string, unknown>;
  budgetMinor?: number;
  currency?: string;
}

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

function rolesFromTemplate(memberRefs: unknown): SwarmRoleDef[] {
  if (!Array.isArray(memberRefs)) return [];
  return memberRefs
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      role: String(m.role ?? "agent"),
      skillSlug: typeof m.skillSlug === "string" ? m.skillSlug : undefined,
      instructions: typeof m.instructions === "string" ? m.instructions : undefined,
    }));
}

export async function runSwarm(
  ctx: AuthContext,
  request: RunSwarmRequest,
  db: Db = getDb(),
): Promise<SwarmRunView> {
  requirePermission(ctx, "jobs.create");

  const template = (
    await db.select().from(schema.swarmTemplates).where(eq(schema.swarmTemplates.id, request.templateId)).limit(1)
  )[0];
  if (!template) throw Errors.notFound("Swarm template not found");
  requireOrganization(ctx, template.organizationId);

  const maxAgents =
    typeof (template.topology as { maxAgents?: unknown })?.maxAgents === "number"
      ? (template.topology as { maxAgents: number }).maxAgents
      : 8;
  const planned = planSwarm({
    objective: request.objective,
    roles: rolesFromTemplate(template.memberRefs),
    maxAgents,
  });
  if (planned.length === 0) throw Errors.validation("Swarm template has no member roles");

  const currency = request.currency ?? template.priceCurrency;
  const budgetMinor = request.budgetMinor ?? template.priceMinor ?? 0;

  // Pre-flight: estimate cost from each agent's skill price and enforce caps.
  const estimates = await Promise.all(
    planned.map(async (agent) => {
      if (!agent.skillSlug) return 0;
      const resolved = await resolveSkillVersion(ctx, agent.skillSlug, undefined, db).catch(() => null);
      return resolved?.priceMinor ?? 0;
    }),
  );
  const estimatedTotal = estimates.reduce((a, b) => a + b, 0);
  if (budgetMinor > 0 && estimatedTotal > budgetMinor) {
    throw Errors.budgetExceeded("Swarm estimated cost exceeds its budget", {
      estimatedTotal,
      budgetMinor,
    });
  }
  await checkBudget(ctx.organizationId, estimatedTotal, currency, db);

  const run = (
    await db
      .insert(schema.swarmRuns)
      .values({
        organizationId: ctx.organizationId,
        swarmTemplateId: template.id,
        status: "running",
        input: { objective: request.objective, ...(request.input ?? {}) },
        costCurrency: currency,
        startedAt: new Date(),
      })
      .returning()
  )[0];
  if (!run) throw Errors.internal("Failed to create swarm run");

  await writeAudit(ctx, {
    action: "swarm.started",
    resourceType: "swarm_run",
    resourceId: run.id,
    after: { templateId: template.id, agents: planned.length },
  }, db);

  const runChild = async (agent: PlannedAgent, index: number): Promise<ChildOutcome> => {
    const agentRow = (
      await db
        .insert(schema.swarmAgents)
        .values({
          organizationId: ctx.organizationId,
          swarmRunId: run.id,
          role: agent.role,
          status: "queued",
          input: { objective: request.objective, instructions: agent.instructions },
          costCurrency: currency,
        })
        .returning()
    )[0];

    // Planning-only agent (no bound skill): deterministic stub, no cost.
    if (!agent.skillSlug) {
      const output = { role: agent.role, note: "planning-only (no skill bound)" };
      if (agentRow) {
        await db
          .update(schema.swarmAgents)
          .set({ status: "succeeded", output })
          .where(eq(schema.swarmAgents.id, agentRow.id));
      }
      return { output, costMinor: 0 };
    }

    const resolved = await resolveSkillVersion(ctx, agent.skillSlug, undefined, db);
    const { job } = await createJobCore(dbJobStore(db), getJobQueue(), {
      organizationId: ctx.organizationId,
      createdByUserId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
      apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
      capability: {
        kind: "skill",
        skillVersionId: resolved.id,
        inputSchema: resolved.inputSchema,
        priceMinor: resolved.priceMinor,
        priceCurrency: resolved.priceCurrency,
      },
      input: { objective: request.objective, role: agent.role, instructions: agent.instructions },
      idempotencyKey: `${run.id}-${index}-${agent.role}`,
      currency,
    });
    const processed = await processJobInDb(job.id, db);

    if (agentRow) {
      await db
        .update(schema.swarmAgents)
        .set({
          jobId: job.id,
          skillVersionId: resolved.id,
          status: processed.status,
          output: processed.output ?? null,
          error: processed.error ?? null,
          costMinor: processed.costMinor,
        })
        .where(eq(schema.swarmAgents.id, agentRow.id));
    }

    return {
      output: processed.output,
      error: processed.status === "failed" ? { code: "EXECUTION_FAILED", message: "child job failed" } : null,
      costMinor: processed.costMinor,
      jobId: job.id,
    };
  };

  const result = await executeSwarm(planned, { runChild, budgetMinor, failurePolicy: "best_effort" });

  const finished = (
    await db
      .update(schema.swarmRuns)
      .set({
        status: result.status === "succeeded" ? "succeeded" : result.status === "failed" ? "failed" : "succeeded",
        output: { byRole: result.byRole, failures: result.failures },
        costMinor: result.totalCostMinor,
        finishedAt: new Date(),
      })
      .where(eq(schema.swarmRuns.id, run.id))
      .returning()
  )[0];

  return toView(finished ?? run, result.agents);
}

function toView(
  run: typeof schema.swarmRuns.$inferSelect,
  agents: Array<{ role: string; error?: unknown; costMinor: number; output?: unknown; jobId?: string }>,
): SwarmRunView {
  return {
    id: run.id,
    status: run.status,
    objective: (run.input as { objective?: string })?.objective ?? "",
    costMinor: run.costMinor,
    costCurrency: run.costCurrency,
    output: run.output,
    agents: agents.map((a) => ({
      role: a.role,
      status: a.error ? "failed" : "succeeded",
      jobId: a.jobId ?? null,
      costMinor: a.costMinor,
      output: a.output ?? null,
      error: a.error ?? null,
    })),
    createdAt: run.createdAt.toISOString(),
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
