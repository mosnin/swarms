/**
 * Swarm spawn — the product. An external agent hands Swarms a list of tasks and
 * its own resources (env/secrets, files, MCP servers, context); Swarms spins up
 * a workforce of sandboxed worker agents — one per task — that all inherit the
 * SAME resources, run on the configured compute provider (Modal in production),
 * and are bounded by a single aggregate budget that is a hard ceiling.
 *
 * Each worker is a normal agent job, so it reuses the whole execution spine
 * (metering, audit, budget reserve/commit). The swarm row groups them and merges
 * their results.
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { createJob as createJobCore } from "@/modules/execution/job-service";
import { dbJobStore } from "@/modules/execution/job-repository";
import { processJobInDb } from "@/modules/execution/worker";
import { storeResourceBundle, type ResourceBundle } from "@/modules/resources/resource-bundle";
import { checkBudget } from "@/server/budget/checkBudget";
import { reserveBudget } from "@/server/budget/reserveBudget";
import { executeSwarm, type ChildOutcome, type PlannedAgent } from "@/server/swarms/executeSwarm";
import { getJobQueue } from "@/server/queue/queue";

type Db = ReturnType<typeof getDb>;

const MAX_WORKERS = 16;
const DEFAULT_GPU_SECONDS_PER_WORKER = 60;

export interface SpawnSwarmRequest {
  /** One worker agent is spawned per task. */
  tasks: string[];
  /** Optional shared objective, given to every worker as context. */
  objective?: string;
  /** Resources inherited by EVERY worker (env, files, MCP servers, context). */
  resources?: ResourceBundle;
  model?: string;
  /** Hard aggregate ceiling across the whole swarm, in minor units. */
  budgetMinor?: number;
  currency?: string;
  idempotencyKey: string;
}

export interface SwarmWorkerView {
  role: string;
  status: string;
  jobId: string | null;
  costMinor: number;
  output: unknown;
  error: unknown;
}

export interface SpawnSwarmResponse {
  swarmRunId: string;
  status: string;
  workerCount: number;
  costMinor: number;
  currency: string;
  maxGpuSecondsPerWorker: number;
  workers: SwarmWorkerView[];
  createdAt: string;
}

/** Spawn a workforce of sandboxed worker agents — one per task. */
export async function spawnSwarm(
  ctx: AuthContext,
  request: SpawnSwarmRequest,
  db: Db = getDb(),
): Promise<SpawnSwarmResponse> {
  requirePermission(ctx, "jobs.create");

  const tasks = (request.tasks ?? []).map((t) => t.trim()).filter((t) => t.length > 0);
  if (tasks.length === 0) throw Errors.validation("At least one task is required");
  if (tasks.length > MAX_WORKERS) {
    throw Errors.validation(`A swarm is capped at ${MAX_WORKERS} workers`, { requested: tasks.length });
  }

  // Fallbacks: Zod defaults don't apply under SKIP_ENV_VALIDATION (build/test).
  const currency = request.currency ?? env.GPU_RATE_CURRENCY ?? "USD";
  const rate = env.GPU_RATE_MINOR_PER_SECOND ?? 2;
  const model = request.model ?? env.AGENT_DEFAULT_MODEL ?? "deepseek/deepseek-chat-v4";
  const resources = request.resources ?? {};

  // Split the aggregate budget evenly into a hard per-worker GPU ceiling.
  const perWorkerMinor =
    request.budgetMinor && request.budgetMinor > 0
      ? Math.max(rate, Math.floor(request.budgetMinor / tasks.length))
      : DEFAULT_GPU_SECONDS_PER_WORKER * rate;
  const maxGpuSecondsPerWorker = rate > 0 ? Math.max(1, Math.floor(perWorkerMinor / rate)) : DEFAULT_GPU_SECONDS_PER_WORKER;
  const aggregateMinor = perWorkerMinor * tasks.length;

  // One budget pre-flight for the whole workforce.
  await checkBudget(ctx.organizationId, aggregateMinor, currency, db, {
    apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
    userId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
  });

  // Encrypt + store the inherited resources ONCE; every worker shares the bundle.
  const createdByUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  const bundleId = await storeResourceBundle(ctx.organizationId, resources, createdByUserId, db);

  const run = (
    await db
      .insert(schema.swarmRuns)
      .values({
        organizationId: ctx.organizationId,
        status: "running",
        input: { objective: request.objective ?? null, workerCount: tasks.length },
        costCurrency: currency,
        startedAt: new Date(),
      })
      .returning()
  )[0];
  if (!run) throw Errors.internal("Failed to create swarm run");

  await writeAudit(
    ctx,
    { action: "swarm.spawned", resourceType: "swarm_run", resourceId: run.id, after: { workers: tasks.length, model } },
    db,
  );

  const planned: PlannedAgent[] = tasks.map((task, i) => ({ role: `worker-${i + 1}`, instructions: task }));
  // Each worker's prompt is its task plus the shared objective as context.
  const taskFor = (instructions: string) =>
    request.objective ? `Objective: ${request.objective}\n\nYour task: ${instructions}` : instructions;

  const runChild = async (agent: PlannedAgent, index: number): Promise<ChildOutcome> => {
    const workerRow = (
      await db
        .insert(schema.swarmAgents)
        .values({
          organizationId: ctx.organizationId,
          swarmRunId: run.id,
          role: agent.role,
          status: "queued",
          input: { task: agent.instructions },
          costCurrency: currency,
        })
        .returning()
    )[0];

    const { job } = await createJobCore(dbJobStore(db), getJobQueue(), {
      organizationId: ctx.organizationId,
      createdByUserId,
      apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
      capability: {
        kind: "agent",
        skillVersionId: null,
        task: taskFor(agent.instructions),
        resourceBundleId: bundleId,
        model,
        priceMinor: perWorkerMinor,
        priceCurrency: currency,
      },
      input: { task: taskFor(agent.instructions), maxGpuSeconds: maxGpuSecondsPerWorker, rateMinorPerSecond: rate, currency },
      idempotencyKey: `${run.id}-${index}`,
      currency,
    });

    await reserveBudget(
      { organizationId: ctx.organizationId, jobId: job.id, amountMinor: perWorkerMinor, currency },
      db,
    );

    const processed = await processJobInDb(job.id, db);

    if (workerRow) {
      await db
        .update(schema.swarmAgents)
        .set({
          jobId: job.id,
          status: processed.status,
          output: processed.output ?? null,
          error: processed.error ?? null,
          costMinor: processed.costMinor,
        })
        .where(eq(schema.swarmAgents.id, workerRow.id));
    }

    return {
      output: processed.output,
      error: processed.status === "failed" ? { code: "EXECUTION_FAILED", message: "worker failed" } : null,
      costMinor: processed.costMinor,
      jobId: job.id,
    };
  };

  const result = await executeSwarm(planned, {
    runChild,
    budgetMinor: aggregateMinor,
    failurePolicy: "best_effort",
  });

  const finished = (
    await db
      .update(schema.swarmRuns)
      .set({
        status: result.status === "failed" ? "failed" : "succeeded",
        output: { byRole: result.byRole, failures: result.failures },
        costMinor: result.totalCostMinor,
        finishedAt: new Date(),
      })
      .where(eq(schema.swarmRuns.id, run.id))
      .returning()
  )[0];

  return {
    swarmRunId: run.id,
    status: finished?.status ?? "succeeded",
    workerCount: tasks.length,
    costMinor: finished?.costMinor ?? result.totalCostMinor,
    currency,
    maxGpuSecondsPerWorker,
    workers: result.agents.map((a) => ({
      role: a.role,
      status: a.error ? "failed" : "succeeded",
      jobId: a.jobId ?? null,
      costMinor: a.costMinor,
      output: a.output ?? null,
      error: a.error ?? null,
    })),
    createdAt: (finished ?? run).createdAt.toISOString(),
  };
}
