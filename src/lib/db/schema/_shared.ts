/**
 * Shared schema building blocks: enums, money columns, and timestamp columns.
 *
 * Conventions (see docs/DATA_MODEL.md):
 * - Primary keys are stable, prefixed, non-sequential public ids (`src/lib/ids`).
 * - Money is stored as an integer count of minor units (bigint) + ISO currency.
 * - Every table carries `createdAt`/`updatedAt`. Append-only tables never update
 *   rows, so `updatedAt` equals `createdAt` for their lifetime.
 */

import { bigint, pgEnum, timestamp, varchar } from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const orgRole = pgEnum("org_role", ["owner", "admin", "developer", "operator", "viewer"]);

export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "awaiting_payment",
  "awaiting_approval",
  "succeeded",
  "failed",
  "cancelled",
]);

export const permissionLevel = pgEnum("permission_level", ["view", "execute", "manage"]);

export const connectorAccountStatus = pgEnum("connector_account_status", [
  "active",
  "revoked",
  "error",
]);

export const ledgerDirection = pgEnum("ledger_direction", ["debit", "credit"]);

export const ledgerEntryKind = pgEnum("ledger_entry_kind", [
  "charge",
  "credit",
  "refund",
  "payment",
  "adjustment",
  "hold",
  "release",
]);

export const paymentAttemptStatus = pgEnum("payment_attempt_status", [
  "pending",
  "settled",
  "failed",
  "expired",
]);

export const budgetPeriod = pgEnum("budget_period", ["once", "daily", "weekly", "monthly"]);

export const policyEffect = pgEnum("policy_effect", ["allow", "deny", "require_approval"]);

export const entityStatus = pgEnum("entity_status", ["active", "archived", "suspended"]);

/* ------------------------------------------------------------------ */
/* Column helpers                                                      */
/* ------------------------------------------------------------------ */

/** ISO-4217 currency code column. */
export function currencyColumn(name = "currency") {
  return varchar(name, { length: 3 });
}

/** Integer minor-unit money amount column (bigint, never float). */
export function amountMinorColumn(name = "amount_minor") {
  return bigint(name, { mode: "number" });
}

/** `createdAt`/`updatedAt`, both UTC. `updatedAt` auto-bumps on update. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
