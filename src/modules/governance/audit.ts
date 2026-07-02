/**
 * Audit writer. Every significant mutation appends an immutable audit event
 * (the `audit_events` table is append-only). This is the minimal writer used
 * across modules; the query/diagnostics surface is expanded in a later phase.
 * Audit failures must never break the primary mutation, so writes are
 * best-effort and swallow errors after logging.
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";

type Db = ReturnType<typeof getDb>;

export interface AuditInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ip?: string | null;
}

/**
 * Write an audit event attributed to the system (no human/agent actor), e.g.
 * from the worker process. Best-effort.
 */
export async function writeAuditSystem(
  organizationId: string,
  input: AuditInput,
  db: Db = getDb(),
): Promise<void> {
  try {
    await db.insert(schema.auditEvents).values({
      organizationId,
      actorUserId: null,
      actorApiKeyId: null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      requestId: input.requestId ?? null,
      ip: input.ip ?? null,
    });
  } catch (error) {
    logger.error("Failed to write system audit event", { action: input.action, error });
  }
}

/** Write an audit event attributed to the actor in `ctx`. Best-effort. */
export async function writeAudit(ctx: AuthContext, input: AuditInput, db: Db = getDb()): Promise<void> {
  try {
    await db.insert(schema.auditEvents).values({
      organizationId: ctx.organizationId,
      actorUserId: ctx.actor.kind === "user" ? ctx.actor.userId : (ctx.actor.userId ?? null),
      actorApiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      requestId: input.requestId ?? null,
      ip: input.ip ?? null,
    });
  } catch (error) {
    logger.error("Failed to write audit event", { action: input.action, error });
  }
}

/* ------------------------------------------------------------------ */
/* Query (dashboard / diagnostics)                                     */
/* ------------------------------------------------------------------ */

export interface AuditFilter {
  action?: string;
  resourceType?: string;
  limit?: number;
}

export interface AuditEventView {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  after: unknown;
  createdAt: Date;
}

/** Query an organization's audit trail, optionally filtered by action/resource. */
export async function listAuditEvents(
  ctx: AuthContext,
  filter: AuditFilter = {},
  db: Db = getDb(),
): Promise<AuditEventView[]> {
  requirePermission(ctx, "audit.read");
  const conditions = [eq(schema.auditEvents.organizationId, ctx.organizationId)];
  if (filter.action) conditions.push(eq(schema.auditEvents.action, filter.action));
  if (filter.resourceType) conditions.push(eq(schema.auditEvents.resourceType, filter.resourceType));

  const rows = await db
    .select({
      id: schema.auditEvents.id,
      action: schema.auditEvents.action,
      resourceType: schema.auditEvents.resourceType,
      resourceId: schema.auditEvents.resourceId,
      actorUserId: schema.auditEvents.actorUserId,
      actorApiKeyId: schema.auditEvents.actorApiKeyId,
      after: schema.auditEvents.after,
      createdAt: schema.auditEvents.createdAt,
    })
    .from(schema.auditEvents)
    .where(and(...conditions))
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(Math.min(filter.limit ?? 100, 500));
  return rows;
}
