/**
 * Just-in-time user provisioning for OAuth login. On first sign-in a user is
 * created together with a personal organization (owner membership + wallet), so
 * an IdP-authenticated principal can immediately use the dashboard. Returns the
 * local user id to embed in the signed session cookie.
 */

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";

type Db = ReturnType<typeof getDb>;

function slugFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const base = local.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/**
 * Resolve the local user for an IdP email, creating the user + a personal org on
 * first login. Idempotent: an existing email returns the existing user.
 */
export async function resolveOrCreateUserByEmail(
  email: string,
  name: string | null,
  db: Db = getDb(),
): Promise<{ userId: string; created: boolean }> {
  const normalized = email.toLowerCase();

  const existing = (
    await db.select().from(schema.users).where(eq(schema.users.email, normalized)).limit(1)
  )[0];
  if (existing) return { userId: existing.id, created: false };

  // First login: create the user, a personal org, an owner membership, a wallet.
  const user = (
    await db
      .insert(schema.users)
      .values({ email: normalized, name: name ?? normalized })
      .returning()
  )[0];
  if (!user) throw Errors.internal("Failed to create user");

  const org = (
    await db
      .insert(schema.organizations)
      .values({ slug: slugFromEmail(normalized), name: name ? `${name}'s Org` : "Personal Org" })
      .returning()
  )[0];
  if (!org) throw Errors.internal("Failed to create organization");

  await db
    .insert(schema.organizationMembers)
    .values({ organizationId: org.id, userId: user.id, role: "owner" });
  await db
    .insert(schema.wallets)
    .values({ organizationId: org.id, currency: "USD", balanceMinor: 0 });

  return { userId: user.id, created: true };
}

/** Whether the user still has at least one org membership (sanity for login). */
export async function userHasMembership(userId: string, db: Db = getDb()): Promise<boolean> {
  const row = (
    await db
      .select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .where(and(eq(schema.organizationMembers.userId, userId)))
      .limit(1)
  )[0];
  return Boolean(row);
}
