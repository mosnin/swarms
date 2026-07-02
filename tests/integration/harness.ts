/**
 * Integration test harness: a real Postgres (PGlite, in-process WASM) with the
 * actual migrations applied. Lets DB-backed services, repositories, and route
 * logic be tested end-to-end without an external database.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { createJob } from "@/modules/execution/job-service";
import { dbJobStore } from "@/modules/execution/job-repository";
import { checkBudget } from "@/server/budget/checkBudget";
import { checkAndReserveBudget } from "@/server/budget/checkAndReserve";
import { getJobQueue } from "@/server/queue/queue";

export type TestDb = ReturnType<typeof getDb>;

const migrationsDir = fileURLToPath(new URL("../../drizzle", import.meta.url));

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Spin up a fresh in-process Postgres with all migrations applied. */
export async function createTestDb(): Promise<{ db: TestDb; client: PGlite }> {
  const client = new PGlite();
  for (const file of migrationFiles()) {
    const sql = readFileSync(`${migrationsDir}/${file}`, "utf8");
    // PGlite executes multi-statement SQL; `-->` lines are `--` comments.
    await client.exec(sql);
  }
  const db = drizzle(client, { schema }) as unknown as TestDb;
  return { db, client };
}

/** Minimal fixture: one org + one owner membership + a wallet. */
export async function seedOrg(
  db: TestDb,
  slug = "test-org",
): Promise<{ organizationId: string; userId: string }> {
  const org = (
    await db.insert(schema.organizations).values({ slug, name: "Test Org" }).returning()
  )[0]!;
  const user = (
    await db
      .insert(schema.users)
      .values({ email: `${slug}@test.local`, name: "Owner" })
      .returning()
  )[0]!;
  await db
    .insert(schema.organizationMembers)
    .values({ organizationId: org.id, userId: user.id, role: "owner" });
  await db
    .insert(schema.wallets)
    .values({ organizationId: org.id, currency: "USD", balanceMinor: 0 });
  return { organizationId: org.id, userId: user.id };
}

/**
 * Enqueue a single agent job through the real execution core (pre-flight budget
 * check → idempotent create → reservation hold), mirroring the orchestration the
 * spawn path performs. The mock agent runtime bills `min(gpuSeconds, maxGpuSeconds)
 * × rate`; a one-word task is 1 GPU-second, so `maxGpuSeconds:1, rate:N` commits
 * exactly N minor units — handy for deterministic budget assertions.
 */
export async function enqueueAgentJob(
  db: TestDb,
  opts: {
    organizationId: string;
    apiKeyId?: string | null;
    userId?: string | null;
    idempotencyKey: string;
    task?: string;
    maxGpuSeconds?: number;
    rateMinorPerSecond?: number;
    currency?: string;
    callbackUrl?: string | null;
    budgetMinor?: number;
  },
): Promise<{ jobId: string; status: string }> {
  const currency = opts.currency ?? "USD";
  const maxGpuSeconds = opts.maxGpuSeconds ?? 1;
  const rate = opts.rateMinorPerSecond ?? 0;
  const priceMinor = maxGpuSeconds * rate;
  const task = opts.task ?? "echo";

  // Pre-check for a fast, deterministic BUDGET_EXCEEDED before creating a job.
  await checkBudget(opts.organizationId, priceMinor, currency, db, {
    apiKeyId: opts.apiKeyId ?? null,
    userId: opts.userId ?? null,
  });

  const { job, replay } = await createJob(dbJobStore(db), getJobQueue(), {
    organizationId: opts.organizationId,
    createdByUserId: opts.userId ?? null,
    apiKeyId: opts.apiKeyId ?? null,
    capability: { kind: "agent", task, priceMinor, priceCurrency: currency },
    input: { task, maxGpuSeconds, rateMinorPerSecond: rate, currency },
    idempotencyKey: opts.idempotencyKey,
    budgetMinor: opts.budgetMinor,
    currency,
    callbackUrl: opts.callbackUrl ?? null,
  });

  if (!replay && priceMinor > 0) {
    // Atomic check-and-reserve, matching the production spawn path.
    await checkAndReserveBudget(
      {
        organizationId: opts.organizationId,
        jobId: job.id,
        amountMinor: priceMinor,
        currency,
        context: { apiKeyId: opts.apiKeyId ?? null, userId: opts.userId ?? null },
      },
      db,
    );
  }
  return { jobId: job.id, status: job.status };
}
