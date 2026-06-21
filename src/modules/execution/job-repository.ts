/**
 * Postgres-backed {@link JobStore} adapter plus the request-facing orchestration
 * for the Hermes execution API. The orchestration layer is where auth guards,
 * capability resolution, budget reservation (append-only ledger hold), audit
 * writes, and queueing are composed around the storage-agnostic core in
 * `job-service.ts`.
 */

import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import {
  requireOrganization,
  requirePermission,
  type AuthContext,
} from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { loadPolicyRules } from "@/modules/governance/policy-repository";
import {
  approveJob as approveJobCore,
  cancelJob as cancelJobCore,
  createJob as createJobCore,
  type CreateJobResult,
  type JobLogRecord,
  type JobRecord,
  type JobStatus,
  type JobStore,
  type ResolvedSkillVersion,
} from "@/modules/execution/job-service";
import { canViewSkill, type SkillVisibility } from "@/modules/catalog/visibility";
import { checkBudget } from "@/server/budget/checkBudget";
import { reserveBudget } from "@/server/budget/reserveBudget";
import { releaseBudget } from "@/server/budget/releaseBudget";
import { evaluatePolicy, type PolicyRequest } from "@/server/policy/evaluatePolicy";
import { getJobQueue } from "@/server/queue/queue";

type Db = ReturnType<typeof getDb>;
type JobRow = typeof schema.jobs.$inferSelect;
type LogRow = typeof schema.executionLogs.$inferSelect;

function toJobRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    createdByUserId: row.createdByUserId,
    apiKeyId: row.apiKeyId,
    capabilityKind: row.capabilityKind as JobRecord["capabilityKind"],
    skillVersionId: row.skillVersionId,
    idempotencyKey: row.idempotencyKey,
    inputHash: row.inputHash,
    input: row.input,
    callbackUrl: row.callbackUrl,
    output: row.output,
    error: row.error,
    status: row.status as JobStatus,
    priority: row.priority,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    costMinor: row.costMinor,
    costCurrency: row.costCurrency,
    queuedAt: row.queuedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLogRecord(row: LogRow): JobLogRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    jobId: row.jobId,
    level: row.level,
    message: row.message,
    data: row.data,
    loggedAt: row.loggedAt,
  };
}

export function dbJobStore(db: Db = getDb()): JobStore {
  return {
    async findByIdempotencyKey(organizationId, key) {
      const row = (
        await db
          .select()
          .from(schema.jobs)
          .where(and(eq(schema.jobs.organizationId, organizationId), eq(schema.jobs.idempotencyKey, key)))
          .limit(1)
      )[0];
      return row ? toJobRecord(row) : null;
    },
    async insert(record) {
      const inserted = (
        await db
          .insert(schema.jobs)
          .values({
            id: record.id,
            organizationId: record.organizationId,
            createdByUserId: record.createdByUserId,
            apiKeyId: record.apiKeyId,
            capabilityKind: record.capabilityKind,
            skillVersionId: record.skillVersionId,
            idempotencyKey: record.idempotencyKey,
            inputHash: record.inputHash,
            input: record.input,
            callbackUrl: record.callbackUrl,
            status: record.status,
            priority: record.priority,
            attempt: record.attempt,
            maxAttempts: record.maxAttempts,
            costMinor: record.costMinor,
            costCurrency: record.costCurrency,
            queuedAt: record.queuedAt,
          })
          .returning()
      )[0];
      if (!inserted) throw Errors.internal("Failed to insert job");
      return toJobRecord(inserted);
    },
    async findById(id) {
      const row = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1))[0];
      return row ? toJobRecord(row) : null;
    },
    async update(id, patch) {
      const row = (
        await db.update(schema.jobs).set(patch).where(eq(schema.jobs.id, id)).returning()
      )[0];
      if (!row) throw Errors.internal("Failed to update job");
      return toJobRecord(row);
    },
    async appendLog(record) {
      const row = (
        await db
          .insert(schema.executionLogs)
          .values({
            id: record.id,
            organizationId: record.organizationId,
            jobId: record.jobId,
            level: record.level,
            message: record.message,
            data: record.data ?? null,
            loggedAt: record.loggedAt,
          })
          .returning()
      )[0];
      if (!row) throw Errors.internal("Failed to append execution log");
      return toLogRecord(row);
    },
    async listLogs(jobId) {
      const rows = await db
        .select()
        .from(schema.executionLogs)
        .where(eq(schema.executionLogs.jobId, jobId))
        .orderBy(asc(schema.executionLogs.loggedAt));
      return rows.map(toLogRecord);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Capability resolution                                               */
/* ------------------------------------------------------------------ */

/**
 * Resolve a skill slug (+ optional version) to a published, viewable skill
 * version. Pins to the requested version, or the newest published one.
 */
export async function resolveSkillVersion(
  ctx: AuthContext,
  skillSlug: string,
  skillVersion: string | undefined,
  db: Db = getDb(),
): Promise<ResolvedSkillVersion & { skillName: string; riskLevel: string; creatorOrganizationId: string }> {
  // The slug is unique per org, but execution may target another org's public
  // skill — match by slug across orgs, then enforce visibility.
  const skills = await db.select().from(schema.skills).where(eq(schema.skills.slug, skillSlug));
  const skill = skills.find((s) =>
    canViewSkill(ctx.organizationId, {
      organizationId: s.organizationId,
      visibility: s.visibility as SkillVisibility,
    }),
  );
  if (!skill) throw Errors.capabilityNotFound(`Skill "${skillSlug}" not found`);

  // Cross-org (marketplace) execution requires an approved review.
  if (skill.organizationId !== ctx.organizationId && skill.reviewStatus !== "approved") {
    throw Errors.capabilityNotFound(`Skill "${skillSlug}" is not approved for marketplace use`);
  }

  const versionRows = await db
    .select()
    .from(schema.skillVersions)
    .where(
      skillVersion
        ? and(eq(schema.skillVersions.skillId, skill.id), eq(schema.skillVersions.version, skillVersion))
        : eq(schema.skillVersions.skillId, skill.id),
    )
    .orderBy(desc(schema.skillVersions.publishedAt));

  const published = versionRows.filter((v) => v.status === "published");
  const chosen = published[0];
  if (!chosen) {
    throw Errors.capabilityNotFound(
      skillVersion
        ? `Version ${skillVersion} of "${skillSlug}" is not published`
        : `No published version of "${skillSlug}"`,
    );
  }

  return {
    id: chosen.id,
    skillId: chosen.skillId,
    status: "published",
    inputSchema: chosen.inputSchema,
    priceMinor: chosen.priceMinor,
    priceCurrency: chosen.priceCurrency,
    skillName: skill.name,
    riskLevel: skill.riskLevel,
    creatorOrganizationId: skill.organizationId,
  };
}

/* ------------------------------------------------------------------ */
/* Request-facing orchestration                                        */
/* ------------------------------------------------------------------ */

export interface ExecuteRequest {
  skillSlug: string;
  skillVersion?: string;
  input: unknown;
  idempotencyKey: string;
  budgetMinor?: number;
  currency?: string;
  callbackUrl?: string;
}

export interface ExecuteResponse {
  jobId: string;
  status: JobStatus;
  paymentRequired: boolean;
  estimatedCostMinor: number;
  currency: string;
  executionUrl: string;
  createdAt: string;
}

/** Authenticated entry point for `POST /api/v1/execute`. */
export async function executeSkill(
  ctx: AuthContext,
  request: ExecuteRequest,
  db: Db = getDb(),
): Promise<ExecuteResponse> {
  requirePermission(ctx, "jobs.create");

  const resolved = await resolveSkillVersion(ctx, request.skillSlug, request.skillVersion, db);
  const currency = request.currency ?? resolved.priceCurrency;

  // (1) Policy: deny / require approval / allow before anything is created.
  const rules = await loadPolicyRules(ctx.organizationId, db);
  const decision = evaluatePolicy(rules, {
    skillRiskLevel: resolved.riskLevel as PolicyRequest["skillRiskLevel"],
    costMinor: resolved.priceMinor,
    requiresPayment: resolved.priceMinor > 0,
  });
  if (decision.effect === "deny") {
    await writeAudit(ctx, {
      action: "policy.denied",
      resourceType: "skill_version",
      resourceId: resolved.id,
      after: { reason: decision.reason },
    }, db);
    throw Errors.policyDenied(decision.reason, { rule: decision.matchedRule?.name });
  }
  const requireApproval = decision.effect === "require_approval";

  // (2) Budget hard-stop check (only for paths that will actually run now).
  // Scope context lets per-key / per-user / per-skill budgets apply.
  if (!requireApproval) {
    await checkBudget(ctx.organizationId, resolved.priceMinor, currency, db, {
      apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
      userId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
      skillId: resolved.skillId,
    });
  }

  const result: CreateJobResult = await createJobCore(dbJobStore(db), getJobQueue(), {
    organizationId: ctx.organizationId,
    createdByUserId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
    apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
    skillVersion: resolved,
    input: request.input,
    idempotencyKey: request.idempotencyKey,
    budgetMinor: request.budgetMinor,
    currency,
    callbackUrl: request.callbackUrl,
    requireApproval,
  });

  // First creation only: reserve budget (append-only hold) + audit.
  if (!result.replay) {
    if (requireApproval) {
      await writeAudit(ctx, {
        action: "policy.approval_required",
        resourceType: "job",
        resourceId: result.job.id,
        after: { reason: decision.reason },
      }, db);
    } else {
      await reserveBudget(
        {
          organizationId: ctx.organizationId,
          jobId: result.job.id,
          amountMinor: resolved.priceMinor,
          currency,
        },
        db,
      );
    }
    await writeAudit(ctx, {
      action: "job.created",
      resourceType: "job",
      resourceId: result.job.id,
      after: { skillSlug: request.skillSlug, status: result.job.status },
    }, db);
  }

  return {
    jobId: result.job.id,
    status: result.job.status,
    paymentRequired: false,
    estimatedCostMinor: resolved.priceMinor,
    currency: result.job.costCurrency,
    executionUrl: `/api/v1/jobs/${result.job.id}`,
    createdAt: result.job.createdAt.toISOString(),
  };
}

export interface JobView {
  id: string;
  status: JobStatus;
  capabilityKind: string;
  skillVersionId: string | null;
  input: unknown;
  output: unknown;
  error: unknown;
  costMinor: number;
  costCurrency: string;
  createdAt: string;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

async function loadJobInOrg(ctx: AuthContext, jobId: string, db: Db): Promise<JobRecord> {
  const job = await dbJobStore(db).findById(jobId);
  if (!job) throw Errors.notFound("Job not found");
  requireOrganization(ctx, job.organizationId);
  return job;
}

export async function getJob(ctx: AuthContext, jobId: string, db: Db = getDb()): Promise<JobView> {
  requirePermission(ctx, "jobs.read");
  const job = await loadJobInOrg(ctx, jobId, db);
  return {
    id: job.id,
    status: job.status,
    capabilityKind: job.capabilityKind,
    skillVersionId: job.skillVersionId,
    input: job.input,
    output: job.output,
    error: job.error,
    costMinor: job.costMinor,
    costCurrency: job.costCurrency,
    createdAt: job.createdAt.toISOString(),
    queuedAt: job.queuedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

export interface JobLogView {
  level: string;
  message: string;
  data: unknown;
  loggedAt: string;
}

export async function getJobLogs(
  ctx: AuthContext,
  jobId: string,
  db: Db = getDb(),
): Promise<JobLogView[]> {
  requirePermission(ctx, "jobs.read");
  await loadJobInOrg(ctx, jobId, db);
  const logs = await dbJobStore(db).listLogs(jobId);
  return logs.map((l) => ({
    level: l.level,
    message: l.message,
    data: l.data,
    loggedAt: l.loggedAt.toISOString(),
  }));
}

export async function cancelJob(
  ctx: AuthContext,
  jobId: string,
  db: Db = getDb(),
): Promise<JobView> {
  requirePermission(ctx, "jobs.cancel");
  await loadJobInOrg(ctx, jobId, db);
  const cancelled = await cancelJobCore(dbJobStore(db), jobId);

  // Release any outstanding reservation hold for the cancelled job.
  await releaseBudget(
    { organizationId: ctx.organizationId, jobId, currency: cancelled.costCurrency },
    db,
  );
  await writeAudit(ctx, {
    action: "job.cancelled",
    resourceType: "job",
    resourceId: jobId,
    after: { status: cancelled.status },
  }, db);

  return {
    id: cancelled.id,
    status: cancelled.status,
    capabilityKind: cancelled.capabilityKind,
    skillVersionId: cancelled.skillVersionId,
    input: cancelled.input,
    output: cancelled.output,
    error: cancelled.error,
    costMinor: cancelled.costMinor,
    costCurrency: cancelled.costCurrency,
    createdAt: cancelled.createdAt.toISOString(),
    queuedAt: cancelled.queuedAt?.toISOString() ?? null,
    startedAt: cancelled.startedAt?.toISOString() ?? null,
    finishedAt: cancelled.finishedAt?.toISOString() ?? null,
  };
}

/** Approve a job awaiting approval, reserve its budget, and enqueue it. */
export async function approveJob(
  ctx: AuthContext,
  jobId: string,
  db: Db = getDb(),
): Promise<JobView> {
  requirePermission(ctx, "policies.manage");
  const job = await loadJobInOrg(ctx, jobId, db);

  // Enforce the budget hard-stop at approval time (state may have changed).
  await checkBudget(ctx.organizationId, job.costMinor || 0, job.costCurrency, db, {
    apiKeyId: job.apiKeyId,
    userId: job.createdByUserId,
  });

  const queued = await approveJobCore(dbJobStore(db), getJobQueue(), jobId);
  await writeAudit(ctx, {
    action: "job.approved",
    resourceType: "job",
    resourceId: jobId,
    after: { status: queued.status },
  }, db);

  return {
    id: queued.id,
    status: queued.status,
    capabilityKind: queued.capabilityKind,
    skillVersionId: queued.skillVersionId,
    input: queued.input,
    output: queued.output,
    error: queued.error,
    costMinor: queued.costMinor,
    costCurrency: queued.costCurrency,
    createdAt: queued.createdAt.toISOString(),
    queuedAt: queued.queuedAt?.toISOString() ?? null,
    startedAt: queued.startedAt?.toISOString() ?? null,
    finishedAt: queued.finishedAt?.toISOString() ?? null,
  };
}
