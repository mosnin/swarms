/**
 * Idempotent development seed. Creates a small but representative data set:
 * one organization, one user (+ membership and wallet), two connectors, and one
 * budget — enough to spawn an agent or a workforce locally.
 *
 * Run with: `DATABASE_URL=... npm run db:seed` (loads validated env via the db
 * client). Safe to run repeatedly — conflicts on natural keys are ignored.
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";

async function upsertReturning<T>(
  label: string,
  find: () => Promise<T | undefined>,
  create: () => Promise<T | undefined>,
): Promise<T> {
  const existing = await find();
  if (existing) return existing;
  const created = (await create()) ?? (await find());
  if (!created) throw new Error(`Failed to seed ${label}`);
  return created;
}

async function seed(): Promise<void> {
  const db = getDb();

  // --- Organization -------------------------------------------------------
  const organization = await upsertReturning(
    "organization",
    async () =>
      (
        await db.select().from(schema.organizations).where(eq(schema.organizations.slug, "demo"))
      )[0],
    async () =>
      (
        await db
          .insert(schema.organizations)
          .values({ slug: "demo", name: "Demo Organization" })
          .onConflictDoNothing()
          .returning()
      )[0],
  );

  // --- User + membership + wallet ----------------------------------------
  const user = await upsertReturning(
    "user",
    async () =>
      (await db.select().from(schema.users).where(eq(schema.users.email, "demo@swarms.cloud")))[0],
    async () =>
      (
        await db
          .insert(schema.users)
          .values({ email: "demo@swarms.cloud", name: "Demo User" })
          .onConflictDoNothing()
          .returning()
      )[0],
  );

  await db
    .insert(schema.organizationMembers)
    .values({ organizationId: organization.id, userId: user.id, role: "owner" })
    .onConflictDoNothing();

  await db
    .insert(schema.wallets)
    .values({ organizationId: organization.id, currency: "USD", balanceMinor: 50_000 })
    .onConflictDoNothing();

  // --- Connectors (2) -----------------------------------------------------
  const connectorSpecs = [
    { slug: "http-fetch", name: "HTTP Fetch", provider: "http" },
    { slug: "postgres-read", name: "Postgres Reader", provider: "postgres" },
  ];

  for (const spec of connectorSpecs) {
    await db
      .insert(schema.connectors)
      .values({
        organizationId: organization.id,
        slug: spec.slug,
        name: spec.name,
        provider: spec.provider,
        description: `${spec.name} demo connector`,
      })
      .onConflictDoNothing();
  }

  // --- Budget (1) ---------------------------------------------------------
  const hasBudget = (
    await db.select().from(schema.budgets).where(eq(schema.budgets.organizationId, organization.id))
  ).some((row) => row.name === "Monthly Demo Budget");
  if (!hasBudget) {
    await db.insert(schema.budgets).values({
      organizationId: organization.id,
      name: "Monthly Demo Budget",
      limitMinor: 100_000,
      currency: "USD",
      period: "monthly",
      hardStop: true,
    });
  }

  logger.info("Seed complete", {
    organizationId: organization.id,
    userId: user.id,
    connectors: connectorSpecs.length,
  });
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error("Seed failed", { error });
    process.exit(1);
  });
