/**
 * Agent spawn service — the product's core. A parent agent spawns a sandboxed
 * worker agent to do a task, handing it the parent's own resources (env, files,
 * MCP tools, context). Compute is rented and paid per GPU-second via x402; the
 * budget is a HARD ceiling on GPU time, so a spawned agent physically cannot
 * overspend. Policy + budget are enforced before anything runs.
 */

import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { loadPolicyRules } from "@/modules/governance/policy-repository";
import { createJob as createJobCore, type JobStatus } from "@/modules/execution/job-service";
import { dbJobStore } from "@/modules/execution/job-repository";
import {
  storeResourceBundle,
  summarize,
  type ResourceBundle,
} from "@/modules/resources/resource-bundle";
import { checkBudget } from "@/server/budget/checkBudget";
import { reserveBudget } from "@/server/budget/reserveBudget";
import { evaluatePolicy } from "@/server/policy/evaluatePolicy";
import { getJobQueue } from "@/server/queue/queue";

type Db = ReturnType<typeof getDb>;

export interface SpawnAgentRequest {
  task: string;
  resources?: ResourceBundle;
  model?: string;
  /** Hard budget ceiling in minor units (caps GPU time). */
  budgetMinor?: number;
  currency?: string;
  idempotencyKey: string;
  callbackUrl?: string;
}

export interface SpawnResponse {
  jobId: string;
  status: JobStatus;
  model: string;
  /** Max GPU-seconds the spawned agent may consume (derived from budget). */
  maxGpuSeconds: number;
  estimatedCostMinor: number;
  currency: string;
  resources: ReturnType<typeof summarize>;
  executionUrl: string;
  createdAt: string;
}

const DEFAULT_GPU_SECONDS = 60;

/** Spawn a sandboxed worker agent (free path — compute funded by org budget). */
export async function spawnAgent(
  ctx: AuthContext,
  request: SpawnAgentRequest,
  db: Db = getDb(),
): Promise<SpawnResponse> {
  requirePermission(ctx, "jobs.create");
  if (!request.task || request.task.trim().length === 0) {
    throw Errors.validation("task is required");
  }

  // Fallbacks: Zod defaults don't apply under SKIP_ENV_VALIDATION (build/test).
  const currency = request.currency ?? env.GPU_RATE_CURRENCY ?? "USD";
  const rate = env.GPU_RATE_MINOR_PER_SECOND ?? 2;
  const model = request.model ?? env.AGENT_DEFAULT_MODEL ?? "claude-haiku-4-5";
  const resources = request.resources ?? {};

  // Budget is a HARD GPU-time ceiling. Without a budget, a default estimate.
  const estimatedCostMinor = request.budgetMinor ?? DEFAULT_GPU_SECONDS * rate;
  const maxGpuSeconds = rate > 0 ? Math.max(1, Math.floor(estimatedCostMinor / rate)) : DEFAULT_GPU_SECONDS;

  // Policy gate (deny / require approval / allow) before anything is created.
  const decision = evaluatePolicy(await loadPolicyRules(ctx.organizationId, db), {
    costMinor: estimatedCostMinor,
    requiresExternalWrite: (resources.mcpServers ?? []).length > 0,
  });
  if (decision.effect === "deny") {
    await writeAudit(ctx, { action: "policy.denied", resourceType: "agent", after: { reason: decision.reason } }, db);
    throw Errors.policyDenied(decision.reason, { rule: decision.matchedRule?.name });
  }
  const requireApproval = decision.effect === "require_approval";

  if (!requireApproval) {
    await checkBudget(ctx.organizationId, estimatedCostMinor, currency, db, {
      apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
      userId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
    });
  }

  // Encrypt + store the inherited resources for sandbox injection.
  const createdByUserId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  const bundleId = await storeResourceBundle(ctx.organizationId, resources, createdByUserId, db);

  const { job, replay } = await createJobCore(dbJobStore(db), getJobQueue(), {
    organizationId: ctx.organizationId,
    createdByUserId,
    apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
    capability: {
      kind: "agent",
      skillVersionId: null,
      task: request.task,
      resourceBundleId: bundleId,
      model,
      priceMinor: estimatedCostMinor,
      priceCurrency: currency,
    },
    input: {
      task: request.task,
      maxGpuSeconds,
      rateMinorPerSecond: rate,
      currency,
    },
    idempotencyKey: request.idempotencyKey,
    budgetMinor: request.budgetMinor,
    currency,
    callbackUrl: request.callbackUrl,
    requireApproval,
  });

  if (!replay) {
    if (requireApproval) {
      await writeAudit(ctx, { action: "policy.approval_required", resourceType: "job", resourceId: job.id }, db);
    } else {
      await reserveBudget(
        { organizationId: ctx.organizationId, jobId: job.id, amountMinor: estimatedCostMinor, currency },
        db,
      );
    }
    await writeAudit(ctx, { action: "agent.spawned", resourceType: "job", resourceId: job.id, after: { model, maxGpuSeconds } }, db);
  }

  return {
    jobId: job.id,
    status: job.status,
    model,
    maxGpuSeconds,
    estimatedCostMinor,
    currency,
    resources: summarize(resources),
    executionUrl: `/api/v1/jobs/${job.id}`,
    createdAt: job.createdAt.toISOString(),
  };
}

