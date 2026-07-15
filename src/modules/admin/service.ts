/**
 * Platform-admin reads: cross-tenant queries for the `/admin` console. Every
 * exported function here is read-only by design — this module has no mutation
 * exports other than the grant/revoke pair in `authz.ts`. Callers (route
 * handlers) are responsible for calling {@link authenticatePlatformAdmin} and
 * {@link logAdminAction} before/after invoking these.
 */

import { and, count, desc, eq, gte, ilike, or, sql, sum } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

export function clampPageSize(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested) || requested <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(requested), MAX_PAGE_SIZE);
}

/* ------------------------------------------------------------------ */
/* Platform overview                                                   */
/* ------------------------------------------------------------------ */

export interface PlatformOverview {
  totalOrganizations: number;
  totalUsers: number;
  totalPlatformAdmins: number;
  jobsByStatus: Record<string, number>;
  activeJobs: number;
  spendLast30dMinor: number;
  spendAllTimeMinor: number;
  jobsLast24h: number;
  failedLast24h: number;
  errorRateLast24h: number;
}

export async function getPlatformOverview(db: Db = getDb()): Promise<PlatformOverview> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    orgCount,
    userCount,
    adminCount,
    statusRows,
    spend30d,
    spendAllTime,
    jobs24h,
    failed24h,
  ] = await Promise.all([
    db.select({ c: count() }).from(schema.organizations),
    db.select({ c: count() }).from(schema.users),
    db
      .select({ c: count() })
      .from(schema.platformAdmins)
      .where(sql`${schema.platformAdmins.revokedAt} IS NULL`),
    db
      .select({ status: schema.jobs.status, c: count() })
      .from(schema.jobs)
      .groupBy(schema.jobs.status),
    db
      .select({ total: sum(schema.jobs.costMinor) })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.status, "succeeded"), gte(schema.jobs.createdAt, since30d))),
    db
      .select({ total: sum(schema.jobs.costMinor) })
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "succeeded")),
    db.select({ c: count() }).from(schema.jobs).where(gte(schema.jobs.createdAt, since24h)),
    db
      .select({ c: count() })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.status, "failed"), gte(schema.jobs.createdAt, since24h))),
  ]);

  const jobsByStatus: Record<string, number> = {};
  for (const row of statusRows) jobsByStatus[row.status] = row.c;
  const activeJobs = (jobsByStatus.queued ?? 0) + (jobsByStatus.running ?? 0);
  const jobsLast24h = jobs24h[0]?.c ?? 0;
  const failedLast24h = failed24h[0]?.c ?? 0;

  return {
    totalOrganizations: orgCount[0]?.c ?? 0,
    totalUsers: userCount[0]?.c ?? 0,
    totalPlatformAdmins: adminCount[0]?.c ?? 0,
    jobsByStatus,
    activeJobs,
    spendLast30dMinor: Number(spend30d[0]?.total ?? 0),
    spendAllTimeMinor: Number(spendAllTime[0]?.total ?? 0),
    jobsLast24h,
    failedLast24h,
    errorRateLast24h: jobsLast24h > 0 ? failedLast24h / jobsLast24h : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Organizations                                                       */
/* ------------------------------------------------------------------ */

export interface OrganizationListRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  memberCount: number;
  jobCount: number;
}

export async function listOrganizations(
  params: { search?: string; page?: number; pageSize?: number },
  db: Db = getDb(),
): Promise<{ rows: OrganizationListRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = clampPageSize(params.pageSize);
  const page = Math.max(1, params.page ?? 1);
  const search = params.search?.trim();

  const where = search
    ? or(ilike(schema.organizations.name, `%${search}%`), ilike(schema.organizations.slug, `%${search}%`))
    : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        status: schema.organizations.status,
        createdAt: schema.organizations.createdAt,
        memberCount: sql<number>`(select count(*) from organization_members m where m.organization_id = ${schema.organizations.id})`,
        jobCount: sql<number>`(select count(*) from jobs j where j.organization_id = ${schema.organizations.id})`,
      })
      .from(schema.organizations)
      .where(where)
      .orderBy(desc(schema.organizations.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ c: count() }).from(schema.organizations).where(where),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, memberCount: Number(r.memberCount), jobCount: Number(r.jobCount) })),
    total: totalRows[0]?.c ?? 0,
    page,
    pageSize,
  };
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  members: Array<{ userId: string; email: string; name: string | null; role: string; joinedAt: Date }>;
  wallets: Array<{ id: string; currency: string; balanceMinor: number }>;
  budgets: Array<{ id: string; name: string; limitMinor: number; spentMinor: number; currency: string; period: string }>;
  recentJobs: Array<{ id: string; status: string; capabilityKind: string; costMinor: number; createdAt: Date }>;
  recentAuditEvents: Array<{ id: string; action: string; resourceType: string; createdAt: Date }>;
}

export async function getOrganizationDetail(
  organizationId: string,
  db: Db = getDb(),
): Promise<OrganizationDetail | null> {
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!org) return null;

  const [members, wallets, budgets, recentJobs, recentAuditEvents] = await Promise.all([
    db
      .select({
        userId: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.organizationMembers.role,
        joinedAt: schema.organizationMembers.createdAt,
      })
      .from(schema.organizationMembers)
      .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
      .where(eq(schema.organizationMembers.organizationId, organizationId))
      .orderBy(desc(schema.organizationMembers.createdAt)),
    db.select().from(schema.wallets).where(eq(schema.wallets.organizationId, organizationId)),
    db.select().from(schema.budgets).where(eq(schema.budgets.organizationId, organizationId)),
    db
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
        capabilityKind: schema.jobs.capabilityKind,
        costMinor: schema.jobs.costMinor,
        createdAt: schema.jobs.createdAt,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.organizationId, organizationId))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(20),
    db
      .select({
        id: schema.auditEvents.id,
        action: schema.auditEvents.action,
        resourceType: schema.auditEvents.resourceType,
        createdAt: schema.auditEvents.createdAt,
      })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.organizationId, organizationId))
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(20),
  ]);

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    createdAt: org.createdAt,
    members: members.map((m) => ({ ...m, role: m.role as string })),
    wallets: wallets.map((w) => ({ id: w.id, currency: w.currency, balanceMinor: w.balanceMinor })),
    budgets: budgets.map((b) => ({
      id: b.id,
      name: b.name,
      limitMinor: b.limitMinor,
      spentMinor: b.spentMinor,
      currency: b.currency,
      period: b.period,
    })),
    recentJobs,
    recentAuditEvents,
  };
}

/* ------------------------------------------------------------------ */
/* Cross-org jobs                                                      */
/* ------------------------------------------------------------------ */

export interface AdminJobRow {
  id: string;
  organizationId: string;
  organizationName: string;
  status: string;
  capabilityKind: string;
  costMinor: number;
  createdAt: Date;
}

const JOB_STATUSES = [
  "queued",
  "running",
  "awaiting_payment",
  "awaiting_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export async function listJobsAcrossOrganizations(
  params: { status?: string; organizationId?: string; page?: number; pageSize?: number },
  db: Db = getDb(),
): Promise<{ rows: AdminJobRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = clampPageSize(params.pageSize);
  const page = Math.max(1, params.page ?? 1);

  const conditions = [];
  if (params.status && (JOB_STATUSES as readonly string[]).includes(params.status)) {
    conditions.push(eq(schema.jobs.status, params.status as (typeof JOB_STATUSES)[number]));
  }
  if (params.organizationId) conditions.push(eq(schema.jobs.organizationId, params.organizationId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: schema.jobs.id,
        organizationId: schema.jobs.organizationId,
        organizationName: schema.organizations.name,
        status: schema.jobs.status,
        capabilityKind: schema.jobs.capabilityKind,
        costMinor: schema.jobs.costMinor,
        createdAt: schema.jobs.createdAt,
      })
      .from(schema.jobs)
      .innerJoin(schema.organizations, eq(schema.jobs.organizationId, schema.organizations.id))
      .where(where)
      .orderBy(desc(schema.jobs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ c: count() }).from(schema.jobs).where(where),
  ]);

  return { rows, total: totalRows[0]?.c ?? 0, page, pageSize };
}

/* ------------------------------------------------------------------ */
/* Admin audit log                                                     */
/* ------------------------------------------------------------------ */

export interface AdminAuditLogRow {
  id: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  targetOrganizationId: string | null;
  reason: string | null;
  ip: string | null;
  createdAt: Date;
}

export async function listAdminAuditLog(
  params: { actorUserId?: string; targetOrganizationId?: string; page?: number; pageSize?: number },
  db: Db = getDb(),
): Promise<{ rows: AdminAuditLogRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = clampPageSize(params.pageSize);
  const page = Math.max(1, params.page ?? 1);

  const conditions = [];
  if (params.actorUserId) conditions.push(eq(schema.adminAuditLog.actorUserId, params.actorUserId));
  if (params.targetOrganizationId) {
    conditions.push(eq(schema.adminAuditLog.targetOrganizationId, params.targetOrganizationId));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: schema.adminAuditLog.id,
        actorUserId: schema.adminAuditLog.actorUserId,
        actorEmail: schema.users.email,
        action: schema.adminAuditLog.action,
        resourceType: schema.adminAuditLog.resourceType,
        resourceId: schema.adminAuditLog.resourceId,
        targetOrganizationId: schema.adminAuditLog.targetOrganizationId,
        reason: schema.adminAuditLog.reason,
        ip: schema.adminAuditLog.ip,
        createdAt: schema.adminAuditLog.createdAt,
      })
      .from(schema.adminAuditLog)
      .innerJoin(schema.users, eq(schema.adminAuditLog.actorUserId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.adminAuditLog.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ c: count() }).from(schema.adminAuditLog).where(where),
  ]);

  return { rows, total: totalRows[0]?.c ?? 0, page, pageSize };
}

/** Small helper for route handlers validating an `inArray` style filter. */
export function isKnownJobStatus(value: string): boolean {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

// Re-exported for routes that need the raw list (e.g. building a <select>).
export { JOB_STATUSES };
