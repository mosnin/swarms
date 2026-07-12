/**
 * Evaluation service — LLM-as-judge quality scoring. Judges inline content or a
 * prior run's output against a rubric, priced as one charged job (metered GPU),
 * reusing the swarm/simulation spine: governance gate, atomic budget reserve,
 * append-only ledger + audit, async director claimed by the worker.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { deriveIdempotencyKey } from "@/lib/idempotency";
import { requireOrganization, requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { loadPolicyRules } from "@/modules/governance/policy-repository";
import { evaluatePolicy } from "@/server/policy/evaluatePolicy";
import { createJob as createJobCore, publishJob } from "@/modules/execution/job-service";
import { dbJobStore } from "@/modules/execution/job-repository";
import { checkBudget } from "@/server/budget/checkBudget";
import { checkAndReserveBudget } from "@/server/budget/checkAndReserve";
import { getJobQueue } from "@/server/queue/queue";
import type { EvaluationConfigInput, Rubric } from "@/modules/evaluations/schema";
import type { DirectorEvaluationConfig } from "@/server/runners/evaluationRunner";

type Db = ReturnType<typeof getDb>;

const DEFAULT_GPU_SECONDS = 30;
const MAX_CONTENT_CHARS = 200_000;

export interface EvaluationResponse {
  evaluationId: string;
  status: string;
  subjectType: string;
  overallScore: number | null;
  passed: boolean | null;
  costMinor: number;
  currency: string;
  estimatedCostMinor: number;
  createdAt: string;
}

function toResponse(
  row: typeof schema.evaluations.$inferSelect,
  estimatedCostMinor: number,
): EvaluationResponse {
  return {
    evaluationId: row.id,
    status: row.status,
    subjectType: row.subjectType,
    overallScore: row.overallScore,
    passed: row.passed,
    costMinor: row.costMinor,
    currency: row.costCurrency,
    estimatedCostMinor,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Resolve the content to judge: inline text, or a prior run's output. */
async function resolveContent(ctx: AuthContext, input: EvaluationConfigInput, db: Db): Promise<string> {
  if (input.subjectType === "text") return (input.content ?? "").slice(0, MAX_CONTENT_CHARS);
  const id = input.subjectId!;
  let output: unknown;
  if (input.subjectType === "job") {
    const row = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1))[0];
    if (!row) throw Errors.notFound("Subject job not found");
    requireOrganization(ctx, row.organizationId);
    output = row.output;
  } else if (input.subjectType === "swarm") {
    const row = (await db.select().from(schema.swarmRuns).where(eq(schema.swarmRuns.id, id)).limit(1))[0];
    if (!row) throw Errors.notFound("Subject swarm run not found");
    requireOrganization(ctx, row.organizationId);
    output = row.output;
  } else {
    const row = (await db.select().from(schema.simulationRuns).where(eq(schema.simulationRuns.id, id)).limit(1))[0];
    if (!row) throw Errors.notFound("Subject simulation run not found");
    requireOrganization(ctx, row.organizationId);
    output = row.output;
  }
  const text = typeof output === "string" ? output : JSON.stringify(output ?? {}, null, 2);
  return text.slice(0, MAX_CONTENT_CHARS);
}

export async function enqueueEvaluation(
  ctx: AuthContext,
  input: EvaluationConfigInput,
  db: Db = getDb(),
): Promise<EvaluationResponse> {
  requirePermission(ctx, "jobs.create");

  const rate = env.GPU_RATE_MINOR_PER_SECOND ?? 2;
  const model = input.model ?? env.EVALUATOR_MODEL ?? env.AGENT_DEFAULT_MODEL ?? "deepseek/deepseek-chat-v4";
  const budgetMinor =
    input.budgetMinor ?? (input.budgetUsd !== undefined ? Math.round(input.budgetUsd * 100) : undefined);
  const currency = (input.currency ?? env.GPU_RATE_CURRENCY ?? "USD").toUpperCase();

  // Reserve is bounded by budget; the judge is capped at maxGpuSeconds so the
  // committed charge (gpuSeconds*rate) can never exceed the reservation.
  const maxGpuSeconds =
    budgetMinor !== undefined && budgetMinor > 0 && rate > 0
      ? Math.max(1, Math.floor(budgetMinor / rate))
      : DEFAULT_GPU_SECONDS;
  const reservedMinor = maxGpuSeconds * rate;
  const estimatedCostMinor = reservedMinor;

  const content = await resolveContent(ctx, input, db);
  if (content.trim().length === 0) throw Errors.validation("Nothing to evaluate: content is empty");

  const decision = evaluatePolicy(await loadPolicyRules(ctx.organizationId, db), { costMinor: reservedMinor });
  if (decision.effect === "deny") {
    await writeAudit(ctx, { action: "policy.denied", resourceType: "evaluation", after: { reason: decision.reason } }, db);
    throw Errors.policyDenied(decision.reason, { rule: decision.matchedRule?.name });
  }
  const requireApproval = decision.effect === "require_approval";

  const idempotencyKey =
    input.idempotencyKey ??
    deriveIdempotencyKey(ctx.organizationId, {
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      rubric: (input.rubric as Rubric).criteria.map((c) => c.name),
      model,
    });

  const existing = (
    await db
      .select()
      .from(schema.evaluations)
      .where(and(eq(schema.evaluations.organizationId, ctx.organizationId), eq(schema.evaluations.idempotencyKey, idempotencyKey)))
      .limit(1)
  )[0];
  if (existing) return toResponse(existing, estimatedCostMinor);

  await checkBudget(ctx.organizationId, reservedMinor, currency, db, {
    apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
    userId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
  });

  const createdByUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  const apiKeyId = ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null;

  const { row, job } = await db.transaction(async (tx) => {
    const createdRow = (
      await tx
        .insert(schema.evaluations)
        .values({
          organizationId: ctx.organizationId,
          idempotencyKey,
          subjectType: input.subjectType,
          subjectId: input.subjectId ?? null,
          rubric: input.rubric,
          model,
          status: requireApproval ? "awaiting_approval" : "queued",
          costCurrency: currency,
        })
        .returning()
    )[0];
    if (!createdRow) throw Errors.internal("Failed to create evaluation");

    const directorConfig: DirectorEvaluationConfig = {
      existingEvaluationId: createdRow.id,
      content,
      rubric: input.rubric as Rubric,
      model,
      maxGpuSeconds,
      rateMinorPerSecond: rate,
      currency,
      callbackUrl: input.callbackUrl,
      apiKeyId,
      createdByUserId,
    };

    const created = await createJobCore(dbJobStore(tx), getJobQueue(), {
      organizationId: ctx.organizationId,
      createdByUserId,
      apiKeyId,
      capability: { kind: "evaluation", task: "evaluation", model, priceMinor: reservedMinor, priceCurrency: currency },
      input: directorConfig,
      idempotencyKey: `evaluation-director-${createdRow.id}`,
      budgetMinor,
      currency,
      enqueue: false,
      requireApproval,
      maxAttempts: 1,
    });

    await tx.update(schema.evaluations).set({ directorJobId: created.job.id }).where(eq(schema.evaluations.id, createdRow.id));

    if (!created.replay && !requireApproval) {
      await checkAndReserveBudget(
        { organizationId: ctx.organizationId, jobId: created.job.id, amountMinor: reservedMinor, currency, context: { apiKeyId, userId: createdByUserId } },
        tx,
      );
    }
    return { row: createdRow, job: created.job };
  });

  if (!requireApproval) await publishJob(job);
  await writeAudit(
    ctx,
    {
      action: requireApproval ? "evaluation.approval_required" : "evaluation.spawned",
      resourceType: "evaluation",
      resourceId: row.id,
      after: { subjectType: input.subjectType, criteria: (input.rubric as Rubric).criteria.length, directorJobId: job.id },
    },
    db,
  );
  return toResponse(row, estimatedCostMinor);
}

export interface EvaluationView {
  id: string;
  status: string;
  subjectType: string;
  subjectId: string | null;
  rubric: unknown;
  scores: unknown;
  overallScore: number | null;
  passed: boolean | null;
  costMinor: number;
  costCurrency: string;
  createdAt: string;
  finishedAt: string | null;
}

export async function getEvaluation(ctx: AuthContext, id: string, db: Db = getDb()): Promise<EvaluationView> {
  requirePermission(ctx, "jobs.read");
  const row = (await db.select().from(schema.evaluations).where(eq(schema.evaluations.id, id)).limit(1))[0];
  if (!row) throw Errors.notFound("Evaluation not found");
  requireOrganization(ctx, row.organizationId);
  return {
    id: row.id,
    status: row.status,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    rubric: row.rubric,
    scores: row.scores,
    overallScore: row.overallScore,
    passed: row.passed,
    costMinor: row.costMinor,
    costCurrency: row.costCurrency,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export async function listEvaluations(
  ctx: AuthContext,
  opts: { limit?: number } = {},
  db: Db = getDb(),
): Promise<EvaluationView[]> {
  requirePermission(ctx, "jobs.read");
  const { desc } = await import("drizzle-orm");
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = await db
    .select()
    .from(schema.evaluations)
    .where(eq(schema.evaluations.organizationId, ctx.organizationId))
    .orderBy(desc(schema.evaluations.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    rubric: row.rubric,
    scores: row.scores,
    overallScore: row.overallScore,
    passed: row.passed,
    costMinor: row.costMinor,
    costCurrency: row.costCurrency,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }));
}
