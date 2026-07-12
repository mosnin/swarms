/**
 * Simulation service — the CrewAI simulations product. A caller (typically an
 * MCP agent) describes a crew of personas and a mode; Swarms runs the whole crew
 * in one sandbox, bounded by a single hard budget, and charges once
 * (base per agent + metered GPU). Reuses the swarm plumbing wholesale:
 * governance gate, atomic budget reserve, append-only ledger + audit, async
 * director job claimed by the worker.
 *
 * Unlike the swarm director (cost 0, orchestrated, children charged separately),
 * the simulation director is a NORMAL poller-claimed, charged job — one sandbox,
 * one charge.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { Errors } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { deriveIdempotencyKey } from "@/lib/idempotency";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { loadPolicyRules } from "@/modules/governance/policy-repository";
import { evaluatePolicy } from "@/server/policy/evaluatePolicy";
import { createJob as createJobCore, publishJob } from "@/modules/execution/job-service";
import { dbJobStore } from "@/modules/execution/job-repository";
import { storeResourceBundle } from "@/modules/resources/resource-bundle";
import { checkBudget } from "@/server/budget/checkBudget";
import { checkAndReserveBudget } from "@/server/budget/checkAndReserve";
import { getJobQueue } from "@/server/queue/queue";
import { estimateSimulationCost, resolveSimulationConfig } from "@/server/simulations/cost";
import type { SimulationConfigInput } from "@/modules/simulations/schema";
import type { DirectorSimulationConfig } from "@/server/runners/simulationRunner";

type Db = ReturnType<typeof getDb>;

export interface SimulationResponse {
  simulationRunId: string;
  status: string;
  mode: string;
  frameworkId: string | null;
  agentCount: number;
  costMinor: number;
  baseFeeMinor: number;
  currency: string;
  maxGpuSeconds: number;
  estimatedCostMinor: number;
  createdAt: string;
}

function runToResponse(
  run: typeof schema.simulationRuns.$inferSelect,
  agentCount: number,
  maxGpuSeconds: number,
  estimatedCostMinor: number,
): SimulationResponse {
  return {
    simulationRunId: run.id,
    status: run.status,
    mode: run.mode,
    frameworkId: run.frameworkId ?? null,
    agentCount,
    costMinor: run.costMinor,
    baseFeeMinor: run.baseFeeMinor,
    currency: run.costCurrency,
    maxGpuSeconds,
    estimatedCostMinor,
    createdAt: run.createdAt.toISOString(),
  };
}

/** Whether this simulation touches an external write surface (MCP tools). */
function requiresExternalWrite(input: SimulationConfigInput): boolean {
  if ((input.resources?.mcpServers ?? []).length > 0) return true;
  return input.scenario?.environment?.kind === "mcp";
}

/**
 * Request-side entry: validate + estimate + gate, create the simulation_run row
 * (queued) and a charged director job, reserve budget before the job is
 * claimable, then enqueue and return immediately. The worker runs the crew via
 * {@link SimulationRunner}; clients poll GET /api/v1/simulations/:id or stream.
 */
export async function enqueueSimulation(
  ctx: AuthContext,
  input: SimulationConfigInput,
  db: Db = getDb(),
): Promise<SimulationResponse> {
  requirePermission(ctx, "jobs.create");

  const config = resolveSimulationConfig(input);
  const budgetMinor =
    input.budgetMinor ?? (input.budgetUsd !== undefined ? Math.round(input.budgetUsd * 100) : undefined);
  const currency = input.currency ?? (input.budgetUsd !== undefined ? "USD" : undefined);

  const estimate = estimateSimulationCost(config, { budgetMinor, currency });
  if (!estimate.withinBudget) {
    throw Errors.budgetExceeded(estimate.rejectionReason ?? "budgetMinor is below the estimated cost", {
      budgetMinor,
      baseMinor: estimate.baseMinor,
      rateMinorPerSecond: estimate.rateMinorPerSecond,
    });
  }

  // Governance gate on the aggregate spend — same policy the agent/swarm paths
  // enforce. A deny/require-approval rule must not be bypassable by wrapping the
  // spend in a simulation.
  const decision = evaluatePolicy(await loadPolicyRules(ctx.organizationId, db), {
    costMinor: estimate.reservedMinor,
    requiresExternalWrite: requiresExternalWrite(input),
  });
  if (decision.effect === "deny") {
    await writeAudit(ctx, { action: "policy.denied", resourceType: "simulation", after: { reason: decision.reason } }, db);
    throw Errors.policyDenied(decision.reason, { rule: decision.matchedRule?.name });
  }
  if (decision.effect === "require_approval") {
    throw Errors.policyDenied(
      "This spend requires approval, which simulation runs do not support. Split it into individual agent jobs (which can be approved) or adjust the policy.",
      { rule: decision.matchedRule?.name },
    );
  }

  const idempotencyKey =
    input.idempotencyKey ??
    deriveIdempotencyKey(ctx.organizationId, {
      mode: config.mode,
      frameworkId: config.frameworkId,
      objective: config.objective,
      agents: config.agents.map((a) => a.name),
      model: config.model,
    });

  // Idempotency: a replayed key returns the original run without re-charging.
  const existing = (
    await db
      .select()
      .from(schema.simulationRuns)
      .where(
        and(
          eq(schema.simulationRuns.organizationId, ctx.organizationId),
          eq(schema.simulationRuns.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
  )[0];
  if (existing) {
    const input0 = (existing.input ?? {}) as { agentCount?: number };
    return runToResponse(existing, input0.agentCount ?? config.agents.length, estimate.maxGpuSeconds, estimate.estimatedCostMinor);
  }

  // Fast budget gate so an over-budget request is rejected synchronously.
  await checkBudget(ctx.organizationId, estimate.reservedMinor, estimate.currency, db, {
    apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
    userId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
  });

  const createdByUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  const apiKeyId = ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null;
  const bundleId = await storeResourceBundle(ctx.organizationId, input.resources ?? {}, createdByUserId, db);

  // Create the run row + charged director job and reserve the budget in ONE
  // transaction (reserve-before-claimable): the poller claims by status=queued,
  // so the reservation hold must be visible together with the job row, else a
  // poller could run + charge before the hold lands. Publish only after commit.
  const directorConfig: DirectorSimulationConfig = {
    config,
    existingRunId: "", // filled after the run row is created (below)
    resourceBundleId: bundleId,
    baseFeeMinor: estimate.baseMinor,
    maxGpuSeconds: estimate.maxGpuSeconds,
    rateMinorPerSecond: estimate.rateMinorPerSecond,
    currency: estimate.currency,
    callbackUrl: input.callbackUrl,
    apiKeyId,
    createdByUserId,
  };

  const { run, job } = await db.transaction(async (tx) => {
    const createdRun = (
      await tx
        .insert(schema.simulationRuns)
        .values({
          organizationId: ctx.organizationId,
          idempotencyKey,
          mode: config.mode,
          frameworkId: config.frameworkId ?? null,
          status: "queued",
          input: {
            objective: config.objective ?? null,
            agentCount: config.agents.length,
            model: config.model,
            frameworkId: config.frameworkId ?? null,
            budgetMinor: budgetMinor ?? null,
            currency: estimate.currency,
          },
          baseFeeMinor: estimate.baseMinor,
          costCurrency: estimate.currency,
        })
        .returning()
    )[0];
    if (!createdRun) throw Errors.internal("Failed to create simulation run");

    const created = await createJobCore(dbJobStore(tx), getJobQueue(), {
      organizationId: ctx.organizationId,
      createdByUserId,
      apiKeyId,
      capability: {
        kind: "simulation",
        task: config.objective ?? "simulation",
        resourceBundleId: bundleId,
        model: config.model,
        priceMinor: estimate.reservedMinor,
        priceCurrency: estimate.currency,
      },
      input: {
        ...directorConfig,
        existingRunId: createdRun.id,
      },
      idempotencyKey: `simulation-director-${createdRun.id}`,
      budgetMinor,
      currency: estimate.currency,
      enqueue: false,
      // Poller-claimed (NOT orchestrated) — one sandbox, one charged job.
      // Not resumable: a retry would find the run already running and no-op,
      // so never retry it (the sim-run reaper recovers orphans).
      maxAttempts: 1,
    });

    // Bind the director to the run, then reserve the budget under the same tx.
    await tx
      .update(schema.simulationRuns)
      .set({ directorJobId: created.job.id })
      .where(eq(schema.simulationRuns.id, createdRun.id));

    if (!created.replay) {
      await checkAndReserveBudget(
        {
          organizationId: ctx.organizationId,
          jobId: created.job.id,
          amountMinor: estimate.reservedMinor,
          currency: estimate.currency,
          context: { apiKeyId, userId: createdByUserId },
        },
        tx,
      );
    }
    return { run: createdRun, job: created.job };
  });

  // Hold committed — now make the director claimable by the worker.
  await publishJob(job);

  await writeAudit(
    ctx,
    {
      action: "simulation.spawned",
      resourceType: "simulation_run",
      resourceId: run.id,
      after: { mode: config.mode, agents: config.agents.length, model: config.model, directorJobId: job.id },
    },
    db,
  );

  return runToResponse(run, config.agents.length, estimate.maxGpuSeconds, estimate.estimatedCostMinor);
}

/** Dry-run cost preview — no run created, no funds reserved. */
export function estimateSimulation(input: SimulationConfigInput) {
  const config = resolveSimulationConfig(input);
  const budgetMinor =
    input.budgetMinor ?? (input.budgetUsd !== undefined ? Math.round(input.budgetUsd * 100) : undefined);
  const currency = input.currency ?? (input.budgetUsd !== undefined ? "USD" : undefined);
  const estimate = estimateSimulationCost(config, { budgetMinor, currency });
  const estimatedCostUsd = estimate.currency === "USD" ? estimate.estimatedCostMinor / 100 : null;
  return {
    mode: estimate.mode,
    agents: estimate.agents,
    baseMinor: estimate.baseMinor,
    rateMinorPerSecond: estimate.rateMinorPerSecond,
    estimatedGpuSeconds: estimate.estimatedGpuSeconds,
    maxGpuSeconds: estimate.maxGpuSeconds,
    estimatedCostMinor: estimate.estimatedCostMinor,
    estimatedCostUsd,
    reservedMinor: estimate.reservedMinor,
    currency: estimate.currency,
    withinBudget: estimate.withinBudget,
    ...(estimate.rejectionReason ? { rejectionReason: estimate.rejectionReason } : {}),
  };
}
