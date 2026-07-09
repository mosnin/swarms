/** Billing: append-only usage ledger, x402 payments, budgets. */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations, wallets } from "@/lib/db/schema/identity";
import { jobs } from "@/lib/db/schema/execution";
import {
  amountMinorColumn,
  budgetPeriod,
  currencyColumn,
  ledgerDirection,
  ledgerEntryKind,
  paymentAttemptStatus,
  timestamps,
} from "@/lib/db/schema/_shared";

/**
 * Append-only, double-entry usage ledger. Rows are never updated or deleted —
 * corrections are made by appending compensating entries. Enforced in the
 * service layer + tests.
 */
export const usageLedgerEntries = pgTable(
  "usage_ledger_entries",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.ledgerEntry)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    walletId: text("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    direction: ledgerDirection("direction").notNull(),
    kind: ledgerEntryKind("kind").notNull(),
    amountMinor: amountMinorColumn().notNull(),
    currency: currencyColumn().notNull(),
    description: text("description"),
    refType: varchar("ref_type", { length: 64 }),
    refId: text("ref_id"),
    ...timestamps,
  },
  (table) => [
    index("ledger_org_idx").on(table.organizationId),
    index("ledger_job_idx").on(table.jobId),
    index("ledger_wallet_idx").on(table.walletId),
    uniqueIndex("ledger_job_charge_uq")
      .on(table.jobId)
      .where(sql`${table.kind} = 'charge' AND ${table.jobId} IS NOT NULL`),
    // At most one 'payment' credit per settlement receipt (ref_id). Makes the
    // credit exactly-once at the DB level so a concurrent replay of a settled
    // payment cannot double-credit the org via check-then-insert.
    uniqueIndex("ledger_payment_credit_uq")
      .on(table.refId)
      .where(sql`${table.kind} = 'payment' AND ${table.refId} IS NOT NULL`),
  ],
);

export const x402PaymentAttempts = pgTable(
  "x402_payment_attempts",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.paymentAttempt)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Linked to a job when the payment funds a specific execution.
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    amountMinor: amountMinorColumn().notNull(),
    currency: currencyColumn().notNull(),
    scheme: varchar("scheme", { length: 64 }).notNull(),
    nonce: text("nonce").notNull(),
    // Digest binding this payment to (org, skill version, idempotency key, price).
    binding: varchar("binding", { length: 64 }).notNull().default(""),
    status: paymentAttemptStatus("status").notNull().default("pending"),
    challenge: jsonb("challenge"),
    proof: jsonb("proof"),
    providerRef: text("provider_ref"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("x402_attempts_org_idem_uq").on(table.organizationId, table.idempotencyKey),
    index("x402_attempts_job_idx").on(table.jobId),
  ],
);

export const x402PaymentReceipts = pgTable(
  "x402_payment_receipts",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.paymentReceipt)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    paymentAttemptId: text("payment_attempt_id")
      .notNull()
      .references(() => x402PaymentAttempts.id, { onDelete: "restrict" }),
    amountMinor: amountMinorColumn().notNull(),
    currency: currencyColumn().notNull(),
    txRef: text("tx_ref").notNull(),
    binding: varchar("binding", { length: 64 }).notNull().default(""),
    providerRef: text("provider_ref"),
    breakdown: jsonb("breakdown"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    index("x402_receipts_job_idx").on(table.jobId),
    index("x402_receipts_attempt_idx").on(table.paymentAttemptId),
    // A settlement reference may be recorded at most once per org (no double-spend).
    uniqueIndex("x402_receipts_org_txref_uq").on(table.organizationId, table.txRef),
    index("x402_receipts_binding_idx").on(table.organizationId, table.binding),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.budget)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scope: jsonb("scope"),
    limitMinor: amountMinorColumn("limit_minor").notNull(),
    currency: currencyColumn().notNull(),
    period: budgetPeriod("period").notNull().default("monthly"),
    hardStop: boolean("hard_stop").notNull().default(true),
    // Cached spend for the current period; reconcilable from the ledger.
    spentMinor: amountMinorColumn("spent_minor").notNull().default(0),
    ...timestamps,
  },
  (table) => [index("budgets_org_idx").on(table.organizationId)],
);

export const usageLedgerEntriesRelations = relations(usageLedgerEntries, ({ one }) => ({
  organization: one(organizations, {
    fields: [usageLedgerEntries.organizationId],
    references: [organizations.id],
  }),
  job: one(jobs, { fields: [usageLedgerEntries.jobId], references: [jobs.id] }),
  wallet: one(wallets, { fields: [usageLedgerEntries.walletId], references: [wallets.id] }),
}));

export const x402PaymentAttemptsRelations = relations(x402PaymentAttempts, ({ one, many }) => ({
  job: one(jobs, { fields: [x402PaymentAttempts.jobId], references: [jobs.id] }),
  receipts: many(x402PaymentReceipts),
}));

export const x402PaymentReceiptsRelations = relations(x402PaymentReceipts, ({ one }) => ({
  attempt: one(x402PaymentAttempts, {
    fields: [x402PaymentReceipts.paymentAttemptId],
    references: [x402PaymentAttempts.id],
  }),
  job: one(jobs, { fields: [x402PaymentReceipts.jobId], references: [jobs.id] }),
}));
