/** Governance: append-only audit events and policy rules. */

import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { apiKeys, organizations, users } from "@/lib/db/schema/identity";
import { policyEffect, timestamps } from "@/lib/db/schema/_shared";

/**
 * Append-only audit trail. Every mutation records who did what to which
 * resource. Rows are never updated or deleted (enforced in the service layer).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.auditEvent)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorApiKeyId: text("actor_api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    action: varchar("action", { length: 128 }).notNull(),
    resourceType: varchar("resource_type", { length: 64 }).notNull(),
    resourceId: text("resource_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    requestId: varchar("request_id", { length: 64 }),
    ip: varchar("ip", { length: 45 }),
    ...timestamps,
  },
  (table) => [
    index("audit_org_idx").on(table.organizationId),
    index("audit_resource_idx").on(table.resourceType, table.resourceId),
  ],
);

export const policyRules = pgTable(
  "policy_rules",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.policyRule)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    effect: policyEffect("effect").notNull().default("deny"),
    action: varchar("action", { length: 128 }).notNull(),
    resourcePattern: text("resource_pattern").notNull().default("*"),
    conditions: jsonb("conditions"),
    priority: integer("priority").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("policy_rules_org_idx").on(table.organizationId)],
);

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditEvents.organizationId],
    references: [organizations.id],
  }),
}));
