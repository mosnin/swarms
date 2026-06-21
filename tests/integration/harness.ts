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
