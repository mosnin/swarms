/** Catalog: skills, skill versions, connectors, and their access grants. */

import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations, users } from "@/lib/db/schema/identity";
import {
  amountMinorColumn,
  connectorAccountStatus,
  currencyColumn,
  entityStatus,
  permissionLevel,
  skillVersionStatus,
  skillVisibility,
  timestamps,
} from "@/lib/db/schema/_shared";

export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.skill)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 96 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    visibility: skillVisibility("visibility").notNull().default("private"),
    status: entityStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("skills_org_slug_uq").on(table.organizationId, table.slug),
    index("skills_visibility_idx").on(table.visibility),
  ],
);

export const skillVersions = pgTable(
  "skill_versions",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.skillVersion)),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 32 }).notNull(),
    status: skillVersionStatus("status").notNull().default("draft"),
    manifest: jsonb("manifest").notNull(),
    inputSchema: jsonb("input_schema").notNull(),
    outputSchema: jsonb("output_schema").notNull(),
    priceMinor: amountMinorColumn("price_minor").notNull().default(0),
    priceCurrency: currencyColumn("price_currency").notNull().default("USD"),
    // Set once at publish time; published rows are immutable (enforced in the
    // service layer + tests). Never null once status = 'published'.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("skill_versions_skill_version_uq").on(table.skillId, table.version)],
);

export const skillPermissions = pgTable(
  "skill_permissions",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.skillPermission)),
    // Owning org of the skill (tenant scope of this grant row).
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    granteeOrganizationId: text("grantee_organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    granteeUserId: text("grantee_user_id").references(() => users.id, { onDelete: "cascade" }),
    level: permissionLevel("level").notNull().default("execute"),
    ...timestamps,
  },
  (table) => [
    index("skill_permissions_skill_idx").on(table.skillId),
    index("skill_permissions_grantee_org_idx").on(table.granteeOrganizationId),
  ],
);

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

export const skillsRelations = relations(skills, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [skills.organizationId],
    references: [organizations.id],
  }),
  versions: many(skillVersions),
  permissions: many(skillPermissions),
}));

export const skillVersionsRelations = relations(skillVersions, ({ one }) => ({
  skill: one(skills, { fields: [skillVersions.skillId], references: [skills.id] }),
}));

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
