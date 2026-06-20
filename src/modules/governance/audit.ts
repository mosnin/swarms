/**
 * Audit writer. Every significant mutation appends an immutable audit event
 * (the `audit_events` table is append-only). This is the minimal writer used
 * across modules; the query/diagnostics surface is expanded in a later phase.
 * Audit failures must never break the primary mutation, so writes are
 * best-effort and swallow errors after logging.
 */

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/modules/identity/access-control";

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
