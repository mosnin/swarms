/**
 * Platform-admin authorization: a distinct, higher-privilege trust boundary
 * from per-organization roles (`modules/identity/access-control.ts`). Org role
 * — including org `owner` — never implies platform-admin access; a user is a
 * platform admin only while holding an active (`revokedAt IS NULL`) row in
 * `platform_admins`.
 *
 * This surface is session-cookie authentication ONLY:
 *  - No API keys. A leaked/compromised machine credential must never reach
 *    cross-tenant data or controls.
 *  - No local-dev header/email bypass, even outside production — unlike
 *    `readSessionRef`/`authenticateRequest`, this reads the signed cookie
 *    directly. The highest-privilege surface gets no dev convenience path.
 *
 * Every resolved platform-admin request is expected to be logged via
 * {@link logAdminAction} by the calling route — reads included, since this
 * surface can see across every tenant.
 */

import type { NextRequest } from "next/server";
import { eq, isNull, and } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { SESSION_COOKIE } from "@/modules/identity/session";
import { verifySessionToken } from "@/modules/identity/session-token";
import { pgRateLimitCheck } from "@/server/ratelimit/pgRateLimiter";
import { getRateLimiter, type RateLimitRule } from "@/server/ratelimit/tokenBucket";
import { env } from "@/lib/env";

type Db = ReturnType<typeof getDb>;

export interface PlatformAdminContext {
  userId: string;
  email: string;
  grantId: string;
}

/**
 * Resolve the caller as an active platform admin from the raw session-cookie
 * value. Throws `UNAUTHORIZED` when there is no valid signed session, and
 * `FORBIDDEN` when the session's user has no active platform-admin grant.
 * Fail-closed on every branch. Shared by the route-handler and server-
 * component entry points below.
 */
async function resolvePlatformAdmin(
  rawCookie: string | undefined,
  db: Db,
): Promise<PlatformAdminContext> {
  const userId = rawCookie ? verifySessionToken(rawCookie, Date.now()) : null;
  if (!userId) throw Errors.unauthorized("A verified session is required for platform-admin access");

  const [grant] = await db
    .select({ id: schema.platformAdmins.id, email: schema.users.email })
    .from(schema.platformAdmins)
    .innerJoin(schema.users, eq(schema.platformAdmins.userId, schema.users.id))
    .where(and(eq(schema.platformAdmins.userId, userId), isNull(schema.platformAdmins.revokedAt)))
    .limit(1);

  if (!grant) throw Errors.forbidden("This account does not hold platform-admin access");

  return { userId, email: grant.email, grantId: grant.id };
}

/** Route-handler entry point: resolve the platform admin from a `NextRequest`. */
export async function authenticatePlatformAdmin(
  request: NextRequest,
  db: Db = getDb(),
): Promise<PlatformAdminContext> {
  return resolvePlatformAdmin(request.cookies.get(SESSION_COOKIE)?.value, db);
}

/**
 * Server-component entry point: resolve the platform admin from a cookie
 * reader shaped like `next/headers`'s `cookies()` result. Mirrors
 * `modules/identity/current.ts`'s `currentContext`/`tryCurrentContext` split.
 */
export async function authenticatePlatformAdminFromCookieStore(
  cookieStore: { get(name: string): { value: string } | undefined },
  db: Db = getDb(),
): Promise<PlatformAdminContext> {
  return resolvePlatformAdmin(cookieStore.get(SESSION_COOKIE)?.value, db);
}

const ADMIN_RATE_RULE: RateLimitRule = { limit: 120, windowMs: 60_000 };

/** Rate-limit a platform-admin principal independent of any org. */
export async function enforceAdminRateLimit(ctx: PlatformAdminContext): Promise<void> {
  const key = `admin:${ctx.userId}`;
  const decision =
    env.RATE_LIMIT_BACKEND === "postgres"
      ? await pgRateLimitCheck(key, ADMIN_RATE_RULE)
      : getRateLimiter().check(key, ADMIN_RATE_RULE);
  if (!decision.allowed) {
    throw Errors.rateLimited(
      `Rate limit exceeded; retry in ${Math.max(0, Math.ceil((decision.retryAtMs - Date.now()) / 1000))}s`,
      { retryAtMs: decision.retryAtMs },
    );
  }
}

export interface LogAdminActionInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  targetOrganizationId?: string | null;
  reason?: string | null;
  requestId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Append an entry to the platform-admin audit trail. Never throws on log failure paths silently — a failed write here must surface, not swallow. */
export async function logAdminAction(
  ctx: PlatformAdminContext,
  input: LogAdminActionInput,
  db: Db = getDb(),
): Promise<void> {
  await db.insert(schema.adminAuditLog).values({
    actorUserId: ctx.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    targetOrganizationId: input.targetOrganizationId ?? null,
    reason: input.reason ?? null,
    requestId: input.requestId ?? null,
    ip: input.ip ?? null,
    metadata: input.metadata ?? null,
  });
}

/**
 * Grant platform-admin access to a user. Re-grants an existing revoked row
 * rather than inserting a duplicate, so history stays on one row per user
 * (mirrors the `apiKeys` rotate-in-place convention).
 */
export async function grantPlatformAdmin(
  grantedByUserId: string,
  targetUserId: string,
  reason: string,
  db: Db = getDb(),
): Promise<string> {
  const [existing] = await db
    .select()
    .from(schema.platformAdmins)
    .where(eq(schema.platformAdmins.userId, targetUserId))
    .limit(1);

  if (existing && !existing.revokedAt) {
    throw Errors.conflict("This user already holds an active platform-admin grant");
  }

  if (existing) {
    const [updated] = await db
      .update(schema.platformAdmins)
      .set({
        grantedByUserId,
        reason,
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      })
      .where(eq(schema.platformAdmins.id, existing.id))
      .returning({ id: schema.platformAdmins.id });
    if (!updated) throw Errors.internal("Failed to re-grant platform-admin access");
    return updated.id;
  }

  const [inserted] = await db
    .insert(schema.platformAdmins)
    .values({ userId: targetUserId, grantedByUserId, reason })
    .returning({ id: schema.platformAdmins.id });
  if (!inserted) throw Errors.internal("Failed to grant platform-admin access");
  return inserted.id;
}

/** Revoke a user's platform-admin access (row stays for the audit trail). */
export async function revokePlatformAdmin(
  revokedByUserId: string,
  targetUserId: string,
  revokeReason: string,
  db: Db = getDb(),
): Promise<void> {
  const [existing] = await db
    .select()
    .from(schema.platformAdmins)
    .where(and(eq(schema.platformAdmins.userId, targetUserId), isNull(schema.platformAdmins.revokedAt)))
    .limit(1);
  if (!existing) throw Errors.notFound("No active platform-admin grant for this user");

  await db
    .update(schema.platformAdmins)
    .set({ revokedAt: new Date(), revokedByUserId, revokeReason })
    .where(eq(schema.platformAdmins.id, existing.id));
}
