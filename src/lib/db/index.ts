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
let testOverride: PostgresJsDatabase<typeof schema> | undefined;

/**
 * Test seam: route handlers call {@link getDb} internally, so integration tests
 * inject their in-process database here. No effect in production.
 */
export function __setTestDb(override: PostgresJsDatabase<typeof schema> | undefined): void {
  testOverride = override;
}

function getClient(): ReturnType<typeof postgres> {
  if (!client) {
    client = postgres(env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 5,
      // Bound every statement so a lock-contended or slow query can never hang a
      // request or the worker tick indefinitely; also cap idle-in-transaction so
      // an abandoned transaction can't hold locks forever.
      connection: {
        statement_timeout: 30_000,
        idle_in_transaction_session_timeout: 15_000,
      },
    });
  }
  return client;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (testOverride) return testOverride;
  if (!db) {
    db = drizzle(getClient(), { schema });
  }
  return db;
}

/**
 * Lightweight connectivity check for readiness probes. Returns a `Result` and
 * never throws, so the readiness endpoint can degrade gracefully. The query is
 * bounded by a short deadline so a wedged database yields a fast negative rather
 * than a hanging probe.
 */
export async function pingDatabase(timeoutMs = 2_000): Promise<boolean> {
  const ping = fromPromise(getClient()`select 1`);
  const deadline = new Promise<{ ok: false }>((resolve) =>
    setTimeout(() => resolve({ ok: false }), timeoutMs),
  );
  const result = await Promise.race([ping, deadline]);
  return result.ok;
}
