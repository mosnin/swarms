/**
 * Idempotent development seed. Creates a small but representative data set:
 * one organization, one user (+ membership and wallet), three skills (each with
 * a published version), two connectors, one budget, and one swarm template.
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
      (await db.select().from(schema.users).where(eq(schema.users.email, "demo@hermes.cloud")))[0],
    async () =>
      (
        await db
          .insert(schema.users)
          .values({ email: "demo@hermes.cloud", name: "Demo User" })
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

  // --- Skills (3) with a published version each ---------------------------
  const skillSpecs = [
    {
      slug: "web-summarize",
      name: "Web Summarizer",
      visibility: "public" as const,
      priceMinor: 200,
    },
    {
      slug: "pdf-extract",
      name: "PDF Extractor",
      visibility: "unlisted" as const,
      priceMinor: 150,
    },
    {
      slug: "code-review",
      name: "Code Reviewer",
      visibility: "private" as const,
      priceMinor: 500,
    },
  ];

  for (const spec of skillSpecs) {
    const skill = await upsertReturning(
      `skill:${spec.slug}`,
      async () =>
        (await db.select().from(schema.skills).where(eq(schema.skills.slug, spec.slug))).find(
          (row) => row.organizationId === organization.id,
        ),
      async () =>
        (
          await db
            .insert(schema.skills)
            .values({
              organizationId: organization.id,
              slug: spec.slug,
              name: spec.name,
              visibility: spec.visibility,
              description: `${spec.name} demo skill`,
            })
            .onConflictDoNothing()
            .returning()
        )[0],
    );

    await db
      .insert(schema.skillVersions)
      .values({
        skillId: skill.id,
        organizationId: organization.id,
        version: "1.0.0",
        status: "published",
        publishedAt: new Date(),
        manifest: { entrypoint: "run", runtime: "sandbox" },
        inputSchema: { type: "object", properties: { input: { type: "string" } } },
        outputSchema: { type: "object", properties: { output: { type: "string" } } },
        priceMinor: spec.priceMinor,
        priceCurrency: "USD",
      })
      .onConflictDoNothing();
  }

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

  // --- Swarm template (1) -------------------------------------------------
  await db
    .insert(schema.swarmTemplates)
    .values({
      organizationId: organization.id,
      slug: "research-swarm",
      name: "Research Swarm",
      description: "Orchestrator + two specialist workers",
      visibility: "private",
      topology: { orchestrator: "lead", members: ["researcher", "summarizer"], maxAgents: 4 },
      memberRefs: [
        { role: "researcher", skillSlug: "web-summarize" },
        { role: "summarizer", skillSlug: "pdf-extract" },
      ],
      priceMinor: 1_000,
      priceCurrency: "USD",
    })
    .onConflictDoNothing();

  // --- Demo competitor-research swarm (4 roles) ---------------------------
  await db
    .insert(schema.swarmTemplates)
    .values({
      organizationId: organization.id,
      slug: "competitor-research-swarm",
      name: "Competitor Research Swarm",
      description: "Researcher, pricing analyst, positioning analyst, synthesis auditor",
      visibility: "private",
      topology: { orchestrator: "synthesis auditor", maxAgents: 4 },
      memberRefs: [
        { role: "researcher", skillSlug: "web-summarize" },
        { role: "pricing analyst", skillSlug: "web-summarize" },
        { role: "positioning analyst", skillSlug: "web-summarize" },
        { role: "synthesis auditor" },
      ],
      priceMinor: 2_000,
      priceCurrency: "USD",
    })
    .onConflictDoNothing();

  logger.info("Seed complete", {
    organizationId: organization.id,
    userId: user.id,
    skills: skillSpecs.length,
    connectors: connectorSpecs.length,
  });
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error("Seed failed", { error });
    process.exit(1);
  });
