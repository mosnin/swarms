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

import { and, eq } from "drizzle-orm";

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
import { releaseBudget } from "@/server/budget/releaseBudget";
import { reserveBudget } from "@/server/budget/reserveBudget";
import { executeSwarm, type ChildOutcome, type PlannedAgent } from "@/server/swarms/executeSwarm";
import { detectDuplicateTasks, type DuplicateWarning } from "@/server/swarms/task-dedup";
import { enqueueWebhook } from "@/modules/webhooks/webhook-service";
import { computeBudgetAlerts } from "@/server/budget/budgetAlerts";
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
  /**
   * When set, a final aggregator agent is spawned after all workers complete.
   * The aggregator receives every successful worker output and synthesises them
   * into one result (Mixture-of-Agents pattern). Budget is allocated for N+1
   * agents when this is provided.
   */
  aggregatorTask?: string;
  /**
   * When true, workers run sequentially and each worker's output is passed as
   * context to the next worker, enabling pipeline-style workflows.
   */
  sequential?: boolean;
  /**
   * Per-worker GPU-second limits. When provided, length must equal tasks.length.
   * The i-th worker gets `workerTimeouts[i] * rate` minor units as its budget.
   * Overrides the uniform per-worker split derived from budgetMinor.
   * The aggregator (if any) always uses the uniform slice.
   */
  workerTimeouts?: number[];
  /**
   * When true, reject the request if any two tasks are exact or near-duplicates
   * (instead of running them and including warnings in the response).
   * Default false — warnings are surfaced but execution continues.
   */
  deduplicateStrict?: boolean;
  /**
   * When provided, a signed `swarm.succeeded` / `swarm.failed` webhook is
   * enqueued after the swarm reaches a terminal state. Delivery is best-effort
   * and non-blocking — failures here never surface to the caller.
   */
  callbackUrl?: string;
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
  /** Synthesised output from the aggregator agent (Mixture-of-Agents), if requested. */
  aggregatorOutput?: unknown;
  /** Non-empty when duplicate or near-duplicate tasks were detected. */
  duplicateWarnings?: DuplicateWarning[];
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

  const duplicateWarnings = detectDuplicateTasks(tasks);
  if (duplicateWarnings.length > 0 && request.deduplicateStrict) {
    throw Errors.validation("Duplicate or near-duplicate tasks detected", {
      duplicates: duplicateWarnings.map((w) => ({
        kind: w.kind,
        tasks: [w.indexA, w.indexB],
        similarity: w.similarity,
      })),
    });
  }

  // Fallbacks: Zod defaults don't apply under SKIP_ENV_VALIDATION (build/test).
  const currency = request.currency ?? env.GPU_RATE_CURRENCY ?? "USD";
  const rate = env.GPU_RATE_MINOR_PER_SECOND ?? 2;
  const model = request.model ?? env.AGENT_DEFAULT_MODEL ?? "deepseek/deepseek-chat-v4";
  const resources = request.resources ?? {};

  // Per-worker timeout overrides: if provided, each worker gets an explicit
  // GPU-second budget; otherwise fall back to an even split of budgetMinor.
  if (request.workerTimeouts !== undefined && request.workerTimeouts.length !== tasks.length) {
    throw Errors.validation(
      `workerTimeouts length (${request.workerTimeouts.length}) must equal tasks length (${tasks.length})`,
    );
  }

  const agentSlots = tasks.length + (request.aggregatorTask ? 1 : 0);
  let perWorkerMinor: number;
  let workerBudgets: number[];

  if (request.workerTimeouts !== undefined) {
    // Explicit per-worker budgets.
    workerBudgets = request.workerTimeouts.map((sec) => Math.max(1, Math.floor(sec * rate)));
    const workerTotal = workerBudgets.reduce((a, b) => a + b, 0);
    // Aggregator (if any) gets the average worker budget.
    perWorkerMinor = Math.floor(workerTotal / tasks.length);
    const aggregatorBudget = request.aggregatorTask ? perWorkerMinor : 0;
    const totalNeeded = workerTotal + aggregatorBudget;
    if (request.budgetMinor && request.budgetMinor > 0 && totalNeeded > request.budgetMinor) {
      throw Errors.budgetExceeded(
        "workerTimeouts exceed budgetMinor",
        { budgetMinor: request.budgetMinor, workerTotal, aggregatorBudget },
      );
    }
  } else {
    // Uniform split across all slots.
    if (request.budgetMinor && request.budgetMinor > 0) {
      perWorkerMinor = Math.floor(request.budgetMinor / agentSlots);
      if (perWorkerMinor < rate) {
        throw Errors.budgetExceeded(
          "budgetMinor is too low to fund one GPU-second per worker",
          { budgetMinor: request.budgetMinor, workers: tasks.length, minPerWorkerMinor: rate },
        );
      }
    } else {
      perWorkerMinor = DEFAULT_GPU_SECONDS_PER_WORKER * rate;
    }
    workerBudgets = tasks.map(() => perWorkerMinor);
  }

  const maxGpuSecondsPerWorker = rate > 0 ? Math.max(1, Math.floor(perWorkerMinor / rate)) : DEFAULT_GPU_SECONDS_PER_WORKER;
  const aggregateMinor = workerBudgets.reduce((a, b) => a + b, 0) + (request.aggregatorTask ? perWorkerMinor : 0);

  // Idempotency: a replayed key returns the original run without re-charging.
  const existing = (
    await db
      .select()
      .from(schema.swarmRuns)
      .where(
        and(
          eq(schema.swarmRuns.organizationId, ctx.organizationId),
          eq(schema.swarmRuns.idempotencyKey, request.idempotencyKey),
        ),
      )
      .limit(1)
  )[0];
  if (existing) {
    const agents = await db
      .select()
      .from(schema.swarmAgents)
      .where(eq(schema.swarmAgents.swarmRunId, existing.id));
    return {
      swarmRunId: existing.id,
      status: existing.status,
      workerCount: agents.length,
      costMinor: existing.costMinor,
      currency: existing.costCurrency,
      maxGpuSecondsPerWorker: maxGpuSecondsPerWorker,
      workers: agents.map((a) => ({
        role: a.role,
        status: a.status,
        jobId: a.jobId ?? null,
        costMinor: a.costMinor,
        output: a.output ?? null,
        error: a.error ?? null,
      })),
      createdAt: existing.createdAt.toISOString(),
    };
  }

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
        idempotencyKey: request.idempotencyKey,
        status: "running",
        input: {
        objective: request.objective ?? null,
        workerCount: tasks.length,
        model: model,
        sequential: request.sequential ?? false,
        aggregatorTask: request.aggregatorTask ?? null,
        budgetMinor: request.budgetMinor ?? null,
        currency,
      },
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
  // Build the full prompt for a worker: shared objective + task + optional prior output.
  const taskFor = (instructions: string, previousOutput?: unknown): string => {
    const parts: string[] = [];
    if (request.objective) parts.push(`Objective: ${request.objective}`);
    parts.push(`Your task: ${instructions}`);
    if (previousOutput !== undefined) {
      const prev = typeof previousOutput === "string"
        ? previousOutput
        : JSON.stringify(previousOutput, null, 2);
      parts.push(`Previous step output:\n${prev}`);
    }
    return parts.join("\n\n");
  };

  // Track job IDs that have a live reservation so we can roll back on partial failure.
  const reservedJobIds: string[] = [];
  // Reuse the same swarmAgent row across retry attempts for the same worker slot.
  const workerRowIds = new Map<number, string>();

  const runChild = async (agent: PlannedAgent, index: number, attempt: number): Promise<ChildOutcome> => {
    // On first attempt, insert the swarmAgent row. On retries, update the existing row.
    let workerRowId = workerRowIds.get(index);
    if (workerRowId === undefined) {
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
      if (!workerRow) throw Errors.internal("Failed to create swarm agent row");
      workerRowId = workerRow.id;
      workerRowIds.set(index, workerRowId);
    } else {
      // Reset status to "queued" for the retry attempt.
      await db
        .update(schema.swarmAgents)
        .set({ status: "queued", error: null, output: null })
        .where(eq(schema.swarmAgents.id, workerRowId));
    }

    // Use per-worker budget for this slot (workerBudgets[index]), or perWorkerMinor
    // for the aggregator (index === tasks.length).
    const thisWorkerBudget = index < workerBudgets.length ? (workerBudgets[index] ?? perWorkerMinor) : perWorkerMinor;
    const thisGpuSeconds = rate > 0 ? Math.max(1, Math.floor(thisWorkerBudget / rate)) : DEFAULT_GPU_SECONDS_PER_WORKER;

    const { job } = await createJobCore(dbJobStore(db), getJobQueue(), {
      organizationId: ctx.organizationId,
      createdByUserId,
      apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
      capability: {
        kind: "agent",
        task: taskFor(agent.instructions, agent.previousOutput),
        resourceBundleId: bundleId,
        model,
        priceMinor: thisWorkerBudget,
        priceCurrency: currency,
      },
      input: { task: taskFor(agent.instructions, agent.previousOutput), maxGpuSeconds: thisGpuSeconds, rateMinorPerSecond: rate, currency },
      idempotencyKey: `${run.id}-${index}-${attempt}`,
      currency,
    });

    await reserveBudget(
      { organizationId: ctx.organizationId, jobId: job.id, amountMinor: thisWorkerBudget, currency },
      db,
    );
    reservedJobIds.push(job.id);

    const processed = await processJobInDb(job.id, db);

    await db
      .update(schema.swarmAgents)
      .set({
        jobId: job.id,
        status: processed.status,
        output: processed.output ?? null,
        error: processed.error ?? null,
        costMinor: processed.costMinor,
      })
      .where(eq(schema.swarmAgents.id, workerRowId));

    return {
      output: processed.output,
      error: processed.status === "failed" ? { code: "EXECUTION_FAILED", message: "worker failed" } : null,
      costMinor: processed.costMinor,
      jobId: job.id,
    };
  };

  let result;
  try {
    result = await executeSwarm(planned, {
      runChild,
      budgetMinor: aggregateMinor,
      failurePolicy: "best_effort",
      parallel: !request.sequential,
      aggregatorTask: request.aggregatorTask,
      maxRetries: 1,
    });
  } catch (err) {
    // If executeSwarm throws (e.g., reserveBudget failed mid-swarm), release
    // all holds that successfully landed so budget headroom is not permanently
    // consumed. Errors here are best-effort — log and rethrow the original.
    await Promise.allSettled(
      reservedJobIds.map((jobId) =>
        releaseBudget({ organizationId: ctx.organizationId, jobId, currency }, db),
      ),
    );
    throw err;
  }

  const finished = (
    await db
      .update(schema.swarmRuns)
      .set({
        status: result.status === "failed" ? "failed" : "succeeded",
        output: {
          byRole: result.byRole,
          failures: result.failures,
          aggregatorOutput: result.aggregatorOutput ?? null,
        },
        costMinor: result.totalCostMinor,
        finishedAt: new Date(),
      })
      .where(eq(schema.swarmRuns.id, run.id))
      .returning()
  )[0];

  const finalStatus = finished?.status ?? "succeeded";
  const finalCostMinor = finished?.costMinor ?? result.totalCostMinor;

  // Best-effort webhook: enqueue and never let failures surface to the caller.
  if (request.callbackUrl) {
    enqueueWebhook(
      {
        organizationId: ctx.organizationId,
        swarmRunId: run.id,
        eventType: `swarm.${finalStatus}`,
        url: request.callbackUrl,
        data: {
          swarmRunId: run.id,
          status: finalStatus,
          workerCount: tasks.length,
          costMinor: finalCostMinor,
          currency,
        },
      },
      db,
    ).catch(() => undefined);

    // Budget threshold alerts: fire after the swarm charge is committed so the
    // spend figure is accurate. Best-effort — never blocks the response.
    computeBudgetAlerts(ctx.organizationId, currency, db)
      .then(async (alerts) => {
        for (const alert of alerts) {
          await enqueueWebhook(
            {
              organizationId: ctx.organizationId,
              swarmRunId: run.id,
              eventType: `budget.${alert.level}`,
              url: request.callbackUrl!,
              data: {
                budgetId: alert.budgetId,
                budgetName: alert.budgetName,
                threshold: alert.threshold,
                level: alert.level,
                spentMinor: alert.spentMinor,
                limitMinor: alert.limitMinor,
                currency: alert.currency,
                period: alert.period,
                usagePercent: alert.usagePercent,
              },
            },
            db,
          );
        }
      })
      .catch(() => undefined);
  }

  return {
    swarmRunId: run.id,
    status: finalStatus,
    workerCount: tasks.length,
    costMinor: finalCostMinor,
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
    aggregatorOutput: result.aggregatorOutput,
    ...(duplicateWarnings.length > 0 ? { duplicateWarnings } : {}),
    createdAt: (finished ?? run).createdAt.toISOString(),
  };
}
