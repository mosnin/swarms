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
import { checkAndReserveBudget } from "@/server/budget/checkAndReserve";
import { releaseBudget } from "@/server/budget/releaseBudget";
import { executeSwarm, type ChildOutcome, type PlannedAgent } from "@/server/swarms/executeSwarm";
import { detectDuplicateTasks, type DuplicateWarning } from "@/server/swarms/task-dedup";
import { findTemplate, expandTemplate } from "@/server/swarms/swarm-templates";
import { fanOutWebhook } from "@/modules/webhooks/webhook-service";
import { computeBudgetAlerts } from "@/server/budget/budgetAlerts";
import { getJobQueue } from "@/server/queue/queue";

type Db = ReturnType<typeof getDb>;

const MAX_WORKERS = 16;
const DEFAULT_GPU_SECONDS_PER_WORKER = 60;

export interface SpawnSwarmRequest {
  /**
   * One worker agent is spawned per task. Optional when `templateId` is
   * provided — the template's default tasks are used and may be overridden
   * by supplying explicit tasks here.
   */
  tasks?: string[];
  /**
   * Pre-built swarm pattern. When provided, tasks / aggregatorTask / sequential
   * default to the template's values; explicit fields on this request override
   * those defaults.
   */
  templateId?: string;
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

/**
 * Options for the worker-side execution path. When `existingRunId` is set, the
 * swarm run row and its resource bundle were already created by
 * {@link enqueueSwarm} in the request handler — this call (running inside the
 * worker, NOT a request handler) adopts that row and executes the workforce into
 * it, rather than creating a new run. This is what makes swarm execution async:
 * the HTTP request returns immediately after enqueue, and the fleet runs here.
 */
export interface SpawnSwarmExecuteOpts {
  /** Adopt this pre-created swarm run instead of creating a new one. */
  existingRunId?: string;
  /** Reuse this pre-stored resource bundle instead of re-encrypting resources. */
  resourceBundleId?: string;
}

/** Build the API response from a persisted swarm run + its agent rows. */
function swarmRunToResponse(
  run: typeof schema.swarmRuns.$inferSelect,
  agents: (typeof schema.swarmAgents.$inferSelect)[],
  maxGpuSecondsPerWorker: number,
): SpawnSwarmResponse {
  const input = (run.input ?? {}) as { workerCount?: number };
  return {
    swarmRunId: run.id,
    status: run.status,
    workerCount: input.workerCount ?? agents.length,
    costMinor: run.costMinor,
    currency: run.costCurrency,
    maxGpuSecondsPerWorker,
    workers: agents.map((a) => ({
      role: a.role,
      status: a.status,
      jobId: a.jobId ?? null,
      costMinor: a.costMinor,
      output: a.output ?? null,
      error: a.error ?? null,
    })),
    createdAt: run.createdAt.toISOString(),
  };
}

/** Fully-resolved swarm plan: validated tasks, per-worker budgets, and totals. */
interface SwarmPlan {
  tasks: string[];
  aggregatorTask?: string;
  sequential?: boolean;
  duplicateWarnings: DuplicateWarning[];
  currency: string;
  rate: number;
  model: string;
  perWorkerMinor: number;
  workerBudgets: number[];
  maxGpuSecondsPerWorker: number;
  aggregateMinor: number;
}

/**
 * Pure validation + budget math shared by {@link enqueueSwarm} (request-side,
 * for a fast synchronous reject + aggregate precheck) and {@link spawnSwarm}
 * (worker-side execution), so the two paths can never diverge. Throws the same
 * validation/budget errors either place.
 */
function computeSwarmPlan(request: SpawnSwarmRequest): SwarmPlan {
  // Template expansion: apply template defaults, then let caller overrides win.
  let rawTasks = request.tasks ?? [];
  let aggregatorTask = request.aggregatorTask;
  let sequential = request.sequential;
  if (request.templateId !== undefined) {
    const template = findTemplate(request.templateId);
    if (!template) {
      throw Errors.validation(
        `Unknown templateId: "${request.templateId}". See GET /api/v1/swarms/templates.`,
      );
    }
    const expanded = expandTemplate(template, request.objective ?? "");
    rawTasks = rawTasks.length > 0 ? rawTasks : expanded.tasks;
    aggregatorTask = aggregatorTask ?? expanded.aggregatorTask;
    sequential = sequential ?? expanded.sequential;
  }

  const tasks = rawTasks.map((t) => t.trim()).filter((t) => t.length > 0);
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

  // Per-worker timeout overrides: if provided, each worker gets an explicit
  // GPU-second budget; otherwise fall back to an even split of budgetMinor.
  if (request.workerTimeouts !== undefined && request.workerTimeouts.length !== tasks.length) {
    throw Errors.validation(
      `workerTimeouts length (${request.workerTimeouts.length}) must equal tasks length (${tasks.length})`,
    );
  }

  const agentSlots = tasks.length + (aggregatorTask ? 1 : 0);
  let perWorkerMinor: number;
  let workerBudgets: number[];

  if (request.workerTimeouts !== undefined) {
    workerBudgets = request.workerTimeouts.map((sec) => Math.max(1, Math.floor(sec * rate)));
    const workerTotal = workerBudgets.reduce((a, b) => a + b, 0);
    perWorkerMinor = Math.floor(workerTotal / tasks.length);
    const aggregatorBudget = aggregatorTask ? perWorkerMinor : 0;
    const totalNeeded = workerTotal + aggregatorBudget;
    if (request.budgetMinor && request.budgetMinor > 0 && totalNeeded > request.budgetMinor) {
      throw Errors.budgetExceeded("workerTimeouts exceed budgetMinor", {
        budgetMinor: request.budgetMinor,
        workerTotal,
        aggregatorBudget,
      });
    }
  } else {
    if (request.budgetMinor && request.budgetMinor > 0) {
      perWorkerMinor = Math.floor(request.budgetMinor / agentSlots);
      if (perWorkerMinor < rate) {
        throw Errors.budgetExceeded("budgetMinor is too low to fund one GPU-second per worker", {
          budgetMinor: request.budgetMinor,
          workers: tasks.length,
          minPerWorkerMinor: rate,
        });
      }
    } else {
      perWorkerMinor = DEFAULT_GPU_SECONDS_PER_WORKER * rate;
    }
    workerBudgets = tasks.map(() => perWorkerMinor);
  }

  const maxGpuSecondsPerWorker =
    rate > 0 ? Math.max(1, Math.floor(perWorkerMinor / rate)) : DEFAULT_GPU_SECONDS_PER_WORKER;
  const aggregateMinor = workerBudgets.reduce((a, b) => a + b, 0) + (aggregatorTask ? perWorkerMinor : 0);

  return {
    tasks,
    aggregatorTask,
    sequential,
    duplicateWarnings,
    currency,
    rate,
    model,
    perWorkerMinor,
    workerBudgets,
    maxGpuSecondsPerWorker,
    aggregateMinor,
  };
}

/** Spawn a workforce of sandboxed worker agents — one per task. */
export async function spawnSwarm(
  ctx: AuthContext,
  request: SpawnSwarmRequest,
  db: Db = getDb(),
  opts: SpawnSwarmExecuteOpts = {},
): Promise<SpawnSwarmResponse> {
  requirePermission(ctx, "jobs.create");

  const plan = computeSwarmPlan(request);
  const { tasks, aggregatorTask, sequential, duplicateWarnings, currency, rate, model } = plan;
  const { perWorkerMinor, workerBudgets, maxGpuSecondsPerWorker, aggregateMinor } = plan;
  const resources = request.resources ?? {};

  // Idempotency: a replayed key returns the original run without re-charging.
  // Skipped on the execute path (existingRunId) — enqueueSwarm already resolved
  // idempotency when it created the run row.
  const existing = opts.existingRunId
    ? undefined
    : (
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
    return swarmRunToResponse(existing, agents, maxGpuSecondsPerWorker);
  }

  const createdByUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;

  let run: typeof schema.swarmRuns.$inferSelect;
  let bundleId: string;

  if (opts.existingRunId) {
    // Execute path: adopt the run row enqueueSwarm created and flip it to running.
    // The CAS (queued → running) ensures a run cancelled before pickup is not
    // executed. The budget precheck + resource bundle were done at enqueue time.
    bundleId = opts.resourceBundleId ?? (await storeResourceBundle(ctx.organizationId, resources, createdByUserId, db));
    const claimed = (
      await db
        .update(schema.swarmRuns)
        .set({ status: "running", startedAt: new Date() })
        .where(
          and(
            eq(schema.swarmRuns.id, opts.existingRunId),
            eq(schema.swarmRuns.organizationId, ctx.organizationId),
            eq(schema.swarmRuns.status, "queued"),
          ),
        )
        .returning()
    )[0];
    if (!claimed) {
      // Not queued anymore — already running, cancelled, or finished. Return its state.
      const current = (
        await db
          .select()
          .from(schema.swarmRuns)
          .where(
            and(
              eq(schema.swarmRuns.id, opts.existingRunId),
              eq(schema.swarmRuns.organizationId, ctx.organizationId),
            ),
          )
          .limit(1)
      )[0];
      if (!current) throw Errors.notFound("Swarm run not found");
      const agents = await db
        .select()
        .from(schema.swarmAgents)
        .where(eq(schema.swarmAgents.swarmRunId, current.id));
      return swarmRunToResponse(current, agents, maxGpuSecondsPerWorker);
    }
    run = claimed;
  } else {
    // One budget pre-flight for the whole workforce.
    await checkBudget(ctx.organizationId, aggregateMinor, currency, db, {
      apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
      userId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
    });

    // Encrypt + store the inherited resources ONCE; every worker shares the bundle.
    bundleId = await storeResourceBundle(ctx.organizationId, resources, createdByUserId, db);

    const created = (
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
            sequential: sequential ?? false,
            aggregatorTask: aggregatorTask ?? null,
            budgetMinor: request.budgetMinor ?? null,
            currency,
          },
          costCurrency: currency,
          startedAt: new Date(),
        })
        .returning()
    )[0];
    if (!created) throw Errors.internal("Failed to create swarm run");
    run = created;

    await writeAudit(
      ctx,
      { action: "swarm.spawned", resourceType: "swarm_run", resourceId: run.id, after: { workers: tasks.length, model } },
      db,
    );
  }

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

    // Cooperative cancellation: before spending money on this worker, re-check
    // the run. If it was cancelled (or is no longer running), stop — don't spawn,
    // reserve, or charge. This makes cancel actually halt an in-flight fleet.
    const liveStatus = (
      await db
        .select({ status: schema.swarmRuns.status })
        .from(schema.swarmRuns)
        .where(eq(schema.swarmRuns.id, run.id))
        .limit(1)
    )[0]?.status;
    if (liveStatus !== "running") {
      return { output: null, error: { code: "CANCELLED", message: `swarm ${liveStatus}` }, costMinor: 0, jobId: undefined };
    }

    // Use per-worker budget for this slot (workerBudgets[index]), or perWorkerMinor
    // for the aggregator (index === tasks.length).
    const thisWorkerBudget = index < workerBudgets.length ? (workerBudgets[index] ?? perWorkerMinor) : perWorkerMinor;
    const thisGpuSeconds = rate > 0 ? Math.max(1, Math.floor(thisWorkerBudget / rate)) : DEFAULT_GPU_SECONDS_PER_WORKER;

    // enqueue:false — the director runs this worker in-process below; enqueueing
    // it too would let another worker replica claim and double-execute it.
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
      enqueue: false,
    });

    // Atomic check-and-reserve under the budget-row lock — the same hard-ceiling
    // guard the single-agent path uses. Concurrent swarms can no longer over-commit.
    await checkAndReserveBudget(
      {
        organizationId: ctx.organizationId,
        jobId: job.id,
        amountMinor: thisWorkerBudget,
        currency,
        context: {
          apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
          userId: createdByUserId,
        },
      },
      db,
    );
    reservedJobIds.push(job.id);

    const processed = await processJobInDb(job.id, db);

    // CAS the agent row: don't resurrect a slot that cancelSwarm set to "cancelled"
    // while this worker was running.
    await db
      .update(schema.swarmAgents)
      .set({
        jobId: job.id,
        status: processed.status,
        output: processed.output ?? null,
        error: processed.error ?? null,
        costMinor: processed.costMinor,
      })
      .where(and(eq(schema.swarmAgents.id, workerRowId), eq(schema.swarmAgents.status, "queued")));

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
      parallel: !sequential,
      aggregatorTask: aggregatorTask,
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

  // CAS running → terminal: if the run was cancelled mid-flight, do NOT flip it
  // back to succeeded/failed (which would also misreport cost). Only a run still
  // "running" is settled here.
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
      .where(and(eq(schema.swarmRuns.id, run.id), eq(schema.swarmRuns.status, "running")))
      .returning()
  )[0];

  // When the CAS matched nothing the run was cancelled concurrently — report its
  // actual current status rather than pretending it succeeded.
  const currentStatus =
    finished?.status ??
    (
      await db
        .select({ status: schema.swarmRuns.status })
        .from(schema.swarmRuns)
        .where(eq(schema.swarmRuns.id, run.id))
        .limit(1)
    )[0]?.status;
  const finalStatus = currentStatus ?? "succeeded";
  const finalCostMinor = finished?.costMinor ?? result.totalCostMinor;

  // Best-effort swarm lifecycle webhook. Fan-out goes to both the per-request
  // callbackUrl (if any) AND every enabled org-level webhook endpoint.
  fanOutWebhook(
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
  // spend figure is accurate. Fan-out to callbackUrl + org endpoints.
  computeBudgetAlerts(ctx.organizationId, currency, db)
    .then(async (alerts) => {
      for (const alert of alerts) {
        await fanOutWebhook(
          {
            organizationId: ctx.organizationId,
            swarmRunId: run.id,
            eventType: `budget.${alert.level}`,
            url: request.callbackUrl,
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

/**
 * Request-side entry: validate + reserve nothing but create the swarm run row
 * (status `queued`) and a cost-0 director job that carries the run id, then
 * enqueue it and return IMMEDIATELY. The standalone worker picks up the director
 * job and runs the fleet via {@link spawnSwarm} (with `existingRunId`) — so the
 * agent workforce never executes inside the HTTP request handler. Clients poll
 * `GET /api/v1/swarms/:id` or stream progress for the result.
 */
export async function enqueueSwarm(
  ctx: AuthContext,
  request: SpawnSwarmRequest,
  db: Db = getDb(),
): Promise<SpawnSwarmResponse> {
  requirePermission(ctx, "jobs.create");

  const plan = computeSwarmPlan(request);

  // Idempotency: a replayed key returns the original run as-is.
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
    return swarmRunToResponse(existing, agents, plan.maxGpuSecondsPerWorker);
  }

  // Fast aggregate budget gate so an over-budget swarm is rejected synchronously
  // (per-worker atomic reservations still happen when the workers run).
  await checkBudget(ctx.organizationId, plan.aggregateMinor, plan.currency, db, {
    apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
    userId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
  });

  const createdByUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  const bundleId = await storeResourceBundle(ctx.organizationId, request.resources ?? {}, createdByUserId, db);

  const run = (
    await db
      .insert(schema.swarmRuns)
      .values({
        organizationId: ctx.organizationId,
        idempotencyKey: request.idempotencyKey,
        status: "queued",
        input: {
          objective: request.objective ?? null,
          workerCount: plan.tasks.length,
          model: plan.model,
          sequential: plan.sequential ?? false,
          aggregatorTask: plan.aggregatorTask ?? null,
          budgetMinor: request.budgetMinor ?? null,
          currency: plan.currency,
        },
        costCurrency: plan.currency,
      })
      .returning()
  )[0];
  if (!run) throw Errors.internal("Failed to create swarm run");

  // Cost-0 director job: it coordinates only; the workers carry the real spend.
  // Its input is the DirectorSwarmConfig the worker's SwarmRunner will execute.
  const { job } = await createJobCore(dbJobStore(db), getJobQueue(), {
    organizationId: ctx.organizationId,
    createdByUserId,
    apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
    capability: {
      kind: "swarm",
      task: request.objective ?? "swarm",
      model: plan.model,
      priceMinor: 0,
      priceCurrency: plan.currency,
    },
    input: {
      existingRunId: run.id,
      resourceBundleId: bundleId,
      tasks: plan.tasks,
      objective: request.objective,
      model: plan.model,
      budgetMinor: request.budgetMinor,
      currency: plan.currency,
      aggregatorTask: plan.aggregatorTask,
      sequential: plan.sequential,
      workerTimeouts: request.workerTimeouts,
      deduplicateStrict: request.deduplicateStrict,
      callbackUrl: request.callbackUrl,
    },
    idempotencyKey: `swarm-director-${run.id}`,
    currency: plan.currency,
    // The director is not resumable: a retry would find the run already
    // "running", no-op, and falsely report success. Never retry it — orphaned
    // runs are recovered by the swarm-run reaper instead.
    maxAttempts: 1,
  });

  await writeAudit(
    ctx,
    {
      action: "swarm.spawned",
      resourceType: "swarm_run",
      resourceId: run.id,
      after: { workers: plan.tasks.length, model: plan.model, directorJobId: job.id, async: true },
    },
    db,
  );

  return {
    ...swarmRunToResponse(run, [], plan.maxGpuSecondsPerWorker),
    ...(plan.duplicateWarnings.length > 0 ? { duplicateWarnings: plan.duplicateWarnings } : {}),
  };
}
