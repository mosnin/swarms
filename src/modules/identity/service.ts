/**
 * DB-backed identity service: API key lifecycle and request authentication.
 * Every mutation here enforces server-side permission + organization checks via
 * the guards in `access-control.ts`. API keys are stored only as a prefix + a
 * one-way hash — never in plaintext.
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { isExpired } from "@/lib/time";
import {
  agentContext,
  assertScopesGrantable,
  requireOrganization,
  requirePermission,
  userContext,
  type AuthContext,
} from "@/modules/identity/access-control";
import { generateApiKey, hashApiKey, looksLikeApiKey } from "@/modules/identity/api-keys";
import { sanitizePermissions, type HumanRole, type Permission } from "@/modules/identity/roles";
import { readSessionRef, type SessionRef } from "@/modules/identity/session";
import { parseScope } from "@/server/budget/scope";

type Db = ReturnType<typeof getDb>;

/** API key as exposed to clients — never includes the hash or plaintext. */
export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: Permission[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  /** Non-null when the key has a spending cap (auto-created scoped budget). */
  budgetMinor: number | null;
  budgetCurrency: string | null;
}

type ApiKeyRow = typeof schema.apiKeys.$inferSelect;
type BudgetRow = typeof schema.budgets.$inferSelect;

function toView(row: ApiKeyRow, budget?: BudgetRow | null): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: sanitizePermissions(row.scopes),
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    budgetMinor: budget?.limitMinor ?? null,
    budgetCurrency: budget?.currency ?? null,
  };
}

async function findKeyBudget(
  apiKeyId: string,
  organizationId: string,
  db: Db,
): Promise<BudgetRow | null> {
  const rows = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.organizationId, organizationId));
  return rows.find((b) => parseScope(b.scope).apiKeyId === apiKeyId) ?? null;
}

/* ------------------------------------------------------------------ */
/* API key management (mutations are permission- and org-guarded)      */
/* ------------------------------------------------------------------ */

export interface CreateApiKeyInput {
  name: string;
  /** Requested permission scopes; must be a subset of the caller's permissions. */
  scopes?: Permission[];
  expiresAt?: Date | null;
  /** When set, auto-creates a scoped hard-stop monthly budget for this key. */
  budgetMinor?: number;
  budgetCurrency?: string;
}

export interface CreateApiKeyResult {
  /** Plaintext key — returned exactly once and never persisted. */
  plaintext: string;
  key: ApiKeyView;
}

export async function createApiKey(
  ctx: AuthContext,
  input: CreateApiKeyInput,
  db: Db = getDb(),
): Promise<CreateApiKeyResult> {
  requirePermission(ctx, "api_keys.manage");
  const scopes = input.scopes ?? [];
  assertScopesGrantable(ctx, scopes);

  const generated = generateApiKey(env.API_KEY_PEPPER);
  const userId = ctx.actor.kind === "user" ? ctx.actor.userId : null;

  const inserted = (
    await db
      .insert(schema.apiKeys)
      .values({
        organizationId: ctx.organizationId,
        userId,
        name: input.name,
        prefix: generated.prefix,
        hashedKey: generated.hashedKey,
        scopes,
        expiresAt: input.expiresAt ?? null,
      })
      .returning()
  )[0];

  if (!inserted) throw Errors.internal("Failed to create API key");

  let budget: BudgetRow | undefined;
  if (input.budgetMinor !== undefined && input.budgetMinor > 0) {
    const currency = (input.budgetCurrency ?? "USD").toUpperCase();
    const [newBudget] = await db
      .insert(schema.budgets)
      .values({
        organizationId: ctx.organizationId,
        name: `Key budget: ${input.name}`,
        limitMinor: input.budgetMinor,
        currency,
        period: "monthly",
        hardStop: true,
        scope: { apiKeyId: inserted.id },
      })
      .returning();
    budget = newBudget;
  }

  return { plaintext: generated.plaintext, key: toView(inserted, budget) };
}

export async function listApiKeys(ctx: AuthContext, db: Db = getDb()): Promise<ApiKeyView[]> {
  requirePermission(ctx, "api_keys.manage");
  const rows = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.organizationId, ctx.organizationId))
    .orderBy(desc(schema.apiKeys.createdAt));

  const budgetRows =
    rows.length > 0
      ? await db
          .select()
          .from(schema.budgets)
          .where(eq(schema.budgets.organizationId, ctx.organizationId))
      : [];

  return rows.map((row) => {
    const budget = budgetRows.find((b) => parseScope(b.scope).apiKeyId === row.id) ?? null;
    return toView(row, budget);
  });
}

/**
 * Rotate an API key's secret IN PLACE: mint a fresh secret for the same key row
 * so its id — and everything hanging off it (scoped budget, audit attribution,
 * schedules, job history) — is preserved while the old secret stops working
 * immediately. Returns the new plaintext exactly once. Revoked keys cannot be
 * rotated (create a new key instead); expired keys can be, and rotation clears
 * the expiry only if the caller supplies a new one at their own layer.
 */
export async function rotateApiKey(
  ctx: AuthContext,
  apiKeyId: string,
  db: Db = getDb(),
): Promise<CreateApiKeyResult> {
  requirePermission(ctx, "api_keys.manage");

  const existing = (
    await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, apiKeyId)).limit(1)
  )[0];
  if (!existing) throw Errors.notFound("API key not found");
  requireOrganization(ctx, existing.organizationId);
  if (existing.revokedAt) {
    throw Errors.conflict("A revoked key cannot be rotated; create a new key instead");
  }

  const generated = generateApiKey(env.API_KEY_PEPPER);
  const updated = (
    await db
      .update(schema.apiKeys)
      .set({ prefix: generated.prefix, hashedKey: generated.hashedKey })
      .where(eq(schema.apiKeys.id, apiKeyId))
      .returning()
  )[0];
  if (!updated) throw Errors.internal("Failed to rotate API key");

  const budget = await findKeyBudget(apiKeyId, existing.organizationId, db);
  return { plaintext: generated.plaintext, key: toView(updated, budget) };
}

export async function revokeApiKey(
  ctx: AuthContext,
  apiKeyId: string,
  db: Db = getDb(),
): Promise<ApiKeyView> {
  requirePermission(ctx, "api_keys.manage");

  const existing = (
    await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, apiKeyId)).limit(1)
  )[0];
  if (!existing) throw Errors.notFound("API key not found");
  // Org-scoped access check: the key must belong to the caller's organization.
  requireOrganization(ctx, existing.organizationId);

  const budget = await findKeyBudget(apiKeyId, existing.organizationId, db);
  if (existing.revokedAt) return toView(existing, budget);

  const updated = (
    await db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.apiKeys.id, apiKeyId))
      .returning()
  )[0];
  if (!updated) throw Errors.internal("Failed to revoke API key");
  return toView(updated, budget);
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

/** Resolve an agent context from a raw API key. Throws `UNAUTHORIZED` on failure. */
export async function authenticateApiKey(rawKey: string, db: Db = getDb()): Promise<AuthContext> {
  if (!looksLikeApiKey(rawKey)) throw Errors.unauthorized("Invalid API key");

  const hashed = hashApiKey(rawKey, env.API_KEY_PEPPER);
  const row = (
    await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.hashedKey, hashed)).limit(1)
  )[0];
  if (!row) throw Errors.unauthorized("Invalid API key");
  if (row.revokedAt) throw Errors.unauthorized("API key revoked");
  if (row.expiresAt && isExpired(row.expiresAt)) throw Errors.unauthorized("API key expired");

  // Best-effort last-used stamp; failures here must not block authentication.
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id));

  return agentContext({
    organizationId: row.organizationId,
    apiKeyId: row.id,
    userId: row.userId,
    scopes: row.scopes,
  });
}

/** Resolve a user context from a session reference. Throws on failure. */
export async function resolveSessionContext(
  ref: SessionRef,
  db: Db = getDb(),
): Promise<AuthContext> {
  const user = (
    await db.select().from(schema.users).where(eq(schema.users.id, ref.userId)).limit(1)
  )[0];
  if (!user) throw Errors.unauthorized("Unknown session user");

  const membership = ref.organizationId
    ? (
        await db
          .select()
          .from(schema.organizationMembers)
          .where(
            and(
              eq(schema.organizationMembers.userId, user.id),
              eq(schema.organizationMembers.organizationId, ref.organizationId),
            ),
          )
          .limit(1)
      )[0]
    : (
        await db
          .select()
          .from(schema.organizationMembers)
          .where(eq(schema.organizationMembers.userId, user.id))
          .orderBy(desc(schema.organizationMembers.createdAt))
          .limit(1)
      )[0];

  if (!membership) throw Errors.forbidden("User is not a member of the requested organization");

  return userContext({
    organizationId: membership.organizationId,
    userId: user.id,
    membershipId: membership.id,
    role: membership.role as HumanRole,
  });
}

/* ------------------------------------------------------------------ */
/* Org-scoped reads for the dashboard                                  */
/* ------------------------------------------------------------------ */

export interface MemberView {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: HumanRole;
  joinedAt: Date;
}

export async function listMembers(ctx: AuthContext, db: Db = getDb()): Promise<MemberView[]> {
  requirePermission(ctx, "org.read");
  const rows = await db
    .select({
      membershipId: schema.organizationMembers.id,
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.organizationMembers.role,
      joinedAt: schema.organizationMembers.createdAt,
    })
    .from(schema.organizationMembers)
    .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
    .where(eq(schema.organizationMembers.organizationId, ctx.organizationId))
    .orderBy(desc(schema.organizationMembers.createdAt));
  return rows.map((row) => ({ ...row, role: row.role as HumanRole }));
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

export async function getOrganization(
  ctx: AuthContext,
  db: Db = getDb(),
): Promise<OrganizationSummary> {
  requirePermission(ctx, "org.read");
  const org = (
    await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, ctx.organizationId))
      .limit(1)
  )[0];
  if (!org) throw Errors.notFound("Organization not found");
  return org;
}

function bearerToken(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

interface RequestLike {
  headers: Headers;
  cookies?: { get(name: string): { value: string } | undefined };
}

/**
 * Authenticate a request: API key (Authorization: Bearer) takes precedence,
 * then a human session, then a dev-only email fallback. Throws `UNAUTHORIZED`
 * when no principal can be resolved.
 */
export async function authenticateRequest(
  request: RequestLike,
  db: Db = getDb(),
): Promise<AuthContext> {
  const token = bearerToken(request.headers);
  if (token) return authenticateApiKey(token, db);

  const sessionRef = readSessionRef(request);
  if (sessionRef) return resolveSessionContext(sessionRef, db);

  // LOCAL DEV ADAPTER: fall back to a configured demo user outside production.
  if (env.NODE_ENV !== "production" && env.DEV_AUTH_USER_EMAIL) {
    const user = (
      await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, env.DEV_AUTH_USER_EMAIL))
        .limit(1)
    )[0];
    if (user) return resolveSessionContext({ userId: user.id }, db);
  }

  throw Errors.unauthorized("Authentication required");
}
