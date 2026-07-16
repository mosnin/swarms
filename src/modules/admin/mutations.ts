/**
 * Platform-admin break-glass mutations. Deliberately the ONLY write surface on
 * the admin console, and deliberately narrow: suspend/reinstate an
 * organization and revoke an API key. Every mutation requires a non-empty
 * human-supplied reason and is recorded to the append-only admin audit log by
 * the calling route BEFORE returning. There is no admin path that edits
 * tenant data, moves money, or touches ledger/audit rows.
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";

type Db = ReturnType<typeof getDb>;

const MIN_REASON_LENGTH = 10;

export function assertBreakGlassReason(reason: unknown): string {
  if (typeof reason !== "string" || reason.trim().length < MIN_REASON_LENGTH) {
    throw Errors.validation(
      `A reason of at least ${MIN_REASON_LENGTH} characters is required for this action`,
    );
  }
  return reason.trim();
}

/** Suspend an organization: blocks new spawns/logins at the authz layer. */
export async function suspendOrganization(organizationId: string, db: Db = getDb()): Promise<void> {
  const [org] = await db
    .select({ id: schema.organizations.id, status: schema.organizations.status })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!org) throw Errors.notFound("Organization not found");
  if (org.status === "suspended") throw Errors.conflict("Organization is already suspended");

  await db
    .update(schema.organizations)
    .set({ status: "suspended" })
    .where(eq(schema.organizations.id, organizationId));
}

/** Reinstate a suspended organization. */
export async function reinstateOrganization(organizationId: string, db: Db = getDb()): Promise<void> {
  const [org] = await db
    .select({ id: schema.organizations.id, status: schema.organizations.status })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!org) throw Errors.notFound("Organization not found");
  if (org.status !== "suspended") throw Errors.conflict("Organization is not suspended");

  await db
    .update(schema.organizations)
    .set({ status: "active" })
    .where(eq(schema.organizations.id, organizationId));
}

/**
 * Revoke an API key across any organization (e.g. a leaked key reported to
 * the platform). Idempotent: revoking an already-revoked key is a no-op.
 * Returns the key's organization for audit attribution.
 */
export async function revokeApiKeyAsAdmin(
  apiKeyId: string,
  db: Db = getDb(),
): Promise<{ organizationId: string }> {
  const [key] = await db
    .select({
      id: schema.apiKeys.id,
      organizationId: schema.apiKeys.organizationId,
      revokedAt: schema.apiKeys.revokedAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.id, apiKeyId))
    .limit(1);
  if (!key) throw Errors.notFound("API key not found");

  if (!key.revokedAt) {
    await db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.apiKeys.id, apiKeyId));
  }
  return { organizationId: key.organizationId };
}
