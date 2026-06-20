/**
 * Drizzle schema root. The full schema lives in `./schema/*` and is re-exported
 * here so both the app (`drizzle(client, { schema })`) and drizzle-kit resolve
 * a single entry point. Postgres is the system of record; every entity carries
 * `createdAt`/`updatedAt`, org-scoped tables carry `organizationId`, and
 * ledger/audit/log tables are append-only.
 */

export * from "@/lib/db/schema/index";
