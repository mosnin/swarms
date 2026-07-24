/**
 * Idempotent development seed. Creates a small but representative data set so a
 * fresh local database looks like a real, in-use account: one organization and
 * user, connectors, budgets, a prepaid ledger credit, three hosted agents (with
 * a short message thread), and two weeks of historical jobs whose spend is
 * reconciled to the append-only ledger. Enough to light up the dashboard, the
 * usage views, and the admin activity chart without touching production.
 *
 * Run with: `DATABASE_URL=... npm run db:seed` (loads validated env via the db
 * client). Safe to run repeatedly — every write is guarded on a natural key.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";

type Db = ReturnType<typeof getDb>;

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

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 14;

/** UTC midnight of the current day — the anchor for backdated demo rows. */
function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Deterministic (seed-stable) job spread across the last two weeks: a handful of
 * jobs per day, mostly succeeded with an integer minor-unit cost, a scattering
 * of failures (which never charge), and a couple still in flight today. Each
 * succeeded job also gets its reconciling `charge` debit on the ledger, so the
 * dashboard's spend and the ledger balance always agree.
 */
async function seedHistoricalJobs(db: Db, organizationId: string, userId: string): Promise<number> {
  const midnight = startOfTodayUtc().getTime();
  let n = 0;
  let seeded = 0;

  for (let d = 0; d < HISTORY_DAYS; d += 1) {
    const daysAgo = HISTORY_DAYS - 1 - d;
    const perDay = 2 + ((d * 3 + 1) % 3); // 2..4, stable per day
    for (let k = 0; k < perDay; k += 1) {
      const idx = n;
      n += 1;
      const isToday = daysAgo === 0;
      // Every 9th job fails; the last one or two of today stay in flight.
      const failed = idx % 9 === 8;
      const inFlight = isToday && k >= perDay - 1;
      const status = inFlight ? "running" : failed ? "failed" : "succeeded";
      const kind = idx % 4 === 0 ? "swarm" : "agent";
      const cost = status === "succeeded" ? 50 + ((idx * 25) % 400) : 0; // integer minor units

      // Land the row a few hours into its day so it buckets cleanly by UTC day.
      const createdAt = new Date(midnight - daysAgo * DAY_MS + (9 + (idx % 6)) * 3_600_000);
      const finishedAt =
        status === "running" ? null : new Date(createdAt.getTime() + 45_000 + (idx % 5) * 15_000);
      const idempotencyKey = `demo:job:${idx}`;

      const job = await upsertReturning(
        `job ${idx}`,
        async () =>
          (
            await db
              .select()
              .from(schema.jobs)
              .where(
                and(
                  eq(schema.jobs.organizationId, organizationId),
                  eq(schema.jobs.idempotencyKey, idempotencyKey),
                ),
              )
          )[0],
        async () =>
          (
            await db
              .insert(schema.jobs)
              .values({
                organizationId,
                createdByUserId: userId,
                capabilityKind: kind,
                task: kind === "swarm" ? "Fan-out research batch" : "Summarize inbound tickets",
                model: "mock",
                idempotencyKey,
                inputHash: `demo-hash-${idx}`,
                input: { task: kind === "swarm" ? "research" : "summarize", n: idx },
                output: status === "succeeded" ? { ok: true, note: "demo result" } : null,
                error: status === "failed" ? { message: "demo failure (seed)" } : null,
                status,
                costMinor: cost,
                costCurrency: "USD",
                queuedAt: createdAt,
                startedAt: createdAt,
                finishedAt,
                createdAt,
                updatedAt: finishedAt ?? createdAt,
              })
              .onConflictDoNothing()
              .returning()
          )[0],
      );
      if (job.idempotencyKey === idempotencyKey && job.status === status) seeded += 1;

      // Reconcile succeeded spend onto the append-only ledger (exactly-once per
      // job via the partial unique index on charge+jobId).
      if (status === "succeeded" && cost > 0) {
        await db
          .insert(schema.usageLedgerEntries)
          .values({
            organizationId,
            jobId: job.id,
            direction: "debit",
            kind: "charge",
            amountMinor: cost,
            currency: "USD",
            description: "Metered job spend (seed)",
            refType: "job",
            refId: job.id,
          })
          .onConflictDoNothing();
      }
    }
  }
  return seeded;
}

export async function seed(db: Db = getDb()): Promise<void> {
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

  const wallet = await upsertReturning(
    "wallet",
    async () =>
      (
        await db.select().from(schema.wallets).where(eq(schema.wallets.organizationId, organization.id))
      )[0],
    async () =>
      (
        await db
          .insert(schema.wallets)
          .values({ organizationId: organization.id, currency: "USD", balanceMinor: 50_000 })
          .onConflictDoNothing()
          .returning()
      )[0],
  );

  // --- Prepaid credit on the ledger (the real source of balance) ---------
  const hasCredit = (
    await db
      .select()
      .from(schema.usageLedgerEntries)
      .where(eq(schema.usageLedgerEntries.organizationId, organization.id))
  ).some((row) => row.refType === "seed_credit");
  if (!hasCredit) {
    await db.insert(schema.usageLedgerEntries).values({
      organizationId: organization.id,
      walletId: wallet.id,
      direction: "credit",
      kind: "credit",
      amountMinor: 500_000,
      currency: "USD",
      description: "Prepaid demo credit",
      refType: "seed_credit",
      refId: "demo:credit:initial",
    });
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

  // --- Webhook endpoint ---------------------------------------------------
  const hasEndpoint = (
    await db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.organizationId, organization.id))
  ).some((row) => row.url === "https://demo.swarms.cloud/webhooks");
  if (!hasEndpoint) {
    await db.insert(schema.webhookEndpoints).values({
      organizationId: organization.id,
      url: "https://demo.swarms.cloud/webhooks",
      description: "Demo delivery endpoint",
      enabled: true,
    });
  }

  // --- Budgets (2) --------------------------------------------------------
  const budgetSpecs = [
    { name: "Monthly Demo Budget", limitMinor: 100_000, period: "monthly", hardStop: true },
    { name: "Daily Guardrail", limitMinor: 10_000, period: "daily", hardStop: false },
  ] as const;
  const existingBudgets = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.organizationId, organization.id));
  for (const spec of budgetSpecs) {
    if (existingBudgets.some((b) => b.name === spec.name)) continue;
    await db.insert(schema.budgets).values({
      organizationId: organization.id,
      name: spec.name,
      limitMinor: spec.limitMinor,
      currency: "USD",
      period: spec.period,
      hardStop: spec.hardStop,
    });
  }

  // --- Hosted agents (3) --------------------------------------------------
  const agentSpecs = [
    {
      name: "Aria — Inbox Concierge",
      instructions: "Triage inbound messages and reply briefly in a warm, concise voice.",
      wakeIntervalMinutes: 60,
      status: "active" as const,
      budgetMinorPerWake: 200,
    },
    {
      name: "Atlas — Research Runner",
      instructions: "On demand, fan out research and return a short synthesis with sources.",
      wakeIntervalMinutes: null,
      status: "active" as const,
      budgetMinorPerWake: 500,
    },
    {
      name: "Echo — Nightly Digest",
      instructions: "Once a day, summarize what changed and what needs attention.",
      wakeIntervalMinutes: 1_440,
      status: "paused" as const,
      budgetMinorPerWake: 300,
    },
  ];

  const existingAgents = await db
    .select()
    .from(schema.agentInstances)
    .where(eq(schema.agentInstances.organizationId, organization.id));
  const agentByName = new Map(existingAgents.map((a) => [a.name, a]));
  for (const spec of agentSpecs) {
    if (agentByName.has(spec.name)) continue;
    const nextWakeAt =
      spec.status === "active" && spec.wakeIntervalMinutes
        ? new Date(Date.now() + spec.wakeIntervalMinutes * 60_000)
        : null;
    const [row] = await db
      .insert(schema.agentInstances)
      .values({
        organizationId: organization.id,
        createdByUserId: user.id,
        name: spec.name,
        instructions: spec.instructions,
        model: "mock",
        status: spec.status,
        wakeIntervalMinutes: spec.wakeIntervalMinutes,
        nextWakeAt,
        budgetMinorPerWake: spec.budgetMinorPerWake,
        currency: "USD",
      })
      .returning();
    if (row) agentByName.set(row.name, row);
  }

  // A short thread on Aria so the agent detail view isn't empty.
  const aria = agentByName.get("Aria — Inbox Concierge");
  if (aria) {
    const threadCount = (
      await db
        .select()
        .from(schema.agentMessages)
        .where(eq(schema.agentMessages.agentInstanceId, aria.id))
    ).length;
    if (threadCount === 0) {
      const base = startOfTodayUtc().getTime() - DAY_MS;
      await db.insert(schema.agentMessages).values([
        {
          organizationId: organization.id,
          agentInstanceId: aria.id,
          role: "user",
          content: "Any customer emails I should look at before standup?",
          createdAt: new Date(base + 8 * 3_600_000),
          processedAt: new Date(base + 8 * 3_600_000 + 2_000),
        },
        {
          organizationId: organization.id,
          agentInstanceId: aria.id,
          role: "agent",
          content:
            "Two: a renewal question from Acme (low urgency) and a billing discrepancy from Globex worth a same-day reply. Drafts are ready.",
          createdAt: new Date(base + 8 * 3_600_000 + 3_000),
          processedAt: new Date(base + 8 * 3_600_000 + 3_000),
        },
      ]);
    }
  }

  // --- Historical jobs + reconciling ledger charges ----------------------
  const jobsSeeded = await seedHistoricalJobs(db, organization.id, user.id);

  logger.info("Seed complete", {
    organizationId: organization.id,
    userId: user.id,
    connectors: connectorSpecs.length,
    agents: agentSpecs.length,
    jobsSeeded,
  });
}

// Auto-run only as a script (`npm run db:seed`); stay inert under the test
// runner so the seed can be imported and exercised against a fixture db.
if (!process.env.VITEST) {
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error("Seed failed", { error });
      process.exit(1);
    });
}
