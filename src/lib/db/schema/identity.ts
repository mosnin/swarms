/** Identity & tenancy: users, organizations, memberships, API keys, wallets. */

import { relations } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import {
  amountMinorColumn,
  currencyColumn,
  entityStatus,
  orgRole,
  timestamps,
} from "@/lib/db/schema/_shared";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.user)),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: text("name"),
  status: entityStatus("status").notNull().default("active"),
  ...timestamps,
});

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.organization)),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: text("name").notNull(),
  status: entityStatus("status").notNull().default("active"),
  ...timestamps,
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.organizationMember)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull().default("viewer"),
    ...timestamps,
  },
  (table) => [uniqueIndex("org_members_org_user_uq").on(table.organizationId, table.userId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.apiKey)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Nullable: org service keys are not tied to a specific human user.
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // Short, non-secret prefix used to locate the key; full key is never stored.
    prefix: varchar("prefix", { length: 16 }).notNull(),
    hashedKey: text("hashed_key").notNull(),
    scopes: text("scopes").array().notNull().default([]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("api_keys_hashed_key_uq").on(table.hashedKey),
    index("api_keys_org_idx").on(table.organizationId),
    index("api_keys_prefix_idx").on(table.prefix),
  ],
);

export const wallets = pgTable(
  "wallets",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.wallet)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    currency: currencyColumn().notNull(),
    // Cached balance derived from the append-only ledger; reconcilable from it.
    balanceMinor: amountMinorColumn("balance_minor").notNull().default(0),
    // Optimistic-concurrency guard for balance updates.
    version: bigint("version", { mode: "number" }).notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("wallets_org_currency_uq").on(table.organizationId, table.currency)],
);

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organizationMembers),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  apiKeys: many(apiKeys),
  wallets: many(wallets),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));
