/**
 * Postgres client (system of record). The connection is created lazily so that
 * importing this module never opens a socket at build time. Use {@link getDb}
 * for queries and {@link pingDatabase} for readiness checks.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import { fromPromise } from "@/lib/result";
import * as schema from "@/lib/db/schema";

let client: ReturnType<typeof postgres> | undefined;
let db: PostgresJsDatabase<typeof schema> | undefined;

function getClient(): ReturnType<typeof postgres> {
  if (!client) {
    client = postgres(env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 5,
    });
  }
  return client;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!db) {
    db = drizzle(getClient(), { schema });
  }
  return db;
}

/**
 * Lightweight connectivity check for readiness probes. Returns a `Result` and
 * never throws, so the readiness endpoint can degrade gracefully.
 */
export async function pingDatabase(): Promise<boolean> {
  const result = await fromPromise(getClient()`select 1`);
  return result.ok;
}
