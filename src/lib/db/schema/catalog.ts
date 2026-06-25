/** Catalog: connectors and their access grants. */

import { relations } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations, users } from "@/lib/db/schema/identity";
import {
  connectorAccountStatus,
  entityStatus,
  permissionLevel,
  timestamps,
} from "@/lib/db/schema/_shared";

export const connectors = pgTable(
  "connectors",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.connector)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 96 }).notNull(),
    name: text("name").notNull(),
    provider: varchar("provider", { length: 96 }).notNull(),
    description: text("description"),
    status: entityStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [uniqueIndex("connectors_org_slug_uq").on(table.organizationId, table.slug)],
);

export const connectorAccounts = pgTable(
  "connector_accounts",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.connectorAccount)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectorId: text("connector_id")
      .notNull()
      .references(() => connectors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    externalAccountId: text("external_account_id"),
    // Credentials are NEVER stored in plaintext. Either a reference to a managed
    // secret (preferred) or an envelope-encrypted blob + the KMS key id used.
    secretRef: text("secret_ref"),
    encryptedCredentials: text("encrypted_credentials"),
    encryptionKeyId: text("encryption_key_id"),
    status: connectorAccountStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [index("connector_accounts_connector_idx").on(table.connectorId)],
);

export const connectorPermissions = pgTable(
  "connector_permissions",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.connectorPermission)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectorId: text("connector_id")
      .notNull()
      .references(() => connectors.id, { onDelete: "cascade" }),
    granteeOrganizationId: text("grantee_organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    granteeUserId: text("grantee_user_id").references(() => users.id, { onDelete: "cascade" }),
    scopes: text("scopes").array().notNull().default([]),
    level: permissionLevel("level").notNull().default("execute"),
    ...timestamps,
  },
  (table) => [index("connector_permissions_connector_idx").on(table.connectorId)],
);

export const connectorsRelations = relations(connectors, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [connectors.organizationId],
    references: [organizations.id],
  }),
  accounts: many(connectorAccounts),
  permissions: many(connectorPermissions),
}));

export const connectorAccountsRelations = relations(connectorAccounts, ({ one }) => ({
  connector: one(connectors, {
    fields: [connectorAccounts.connectorId],
    references: [connectors.id],
  }),
}));
