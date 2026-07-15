/**
 * Platform-admin surface: a distinct, higher-privilege trust boundary from
 * per-organization roles (see `identity.ts` / `roles.ts`). No org role — not
 * even org `owner` — implies platform-admin access; it is granted explicitly
 * per user and is fully revocable.
 *
 * `platformAdmins` follows the same row-per-principal, revoke-in-place pattern
 * as `apiKeys`: one row per user, `revokedAt` set (never deleted) when access
 * is pulled, so the grant history stays inspectable for access reviews.
 *
 * `adminAuditLog` is append-only and independent of the per-org `auditEvents`
 * trail: every platform-admin request — reads included — is recorded here,
 * because this surface can see and act across every tenant.
 */

import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations, users } from "@/lib/db/schema/identity";
import { timestamps } from "@/lib/db/schema/_shared";

export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.platformAdmin)),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedByUserId: text("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokeReason: text("revoke_reason"),
    ...timestamps,
  },
  (table) => [index("platform_admins_user_idx").on(table.userId)],
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.adminAuditLog)),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 128 }).notNull(),
    targetOrganizationId: text("target_organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    resourceType: varchar("resource_type", { length: 64 }).notNull(),
    resourceId: text("resource_id"),
    reason: text("reason"),
    requestId: varchar("request_id", { length: 64 }),
    ip: varchar("ip", { length: 45 }),
    metadata: jsonb("metadata"),
    ...timestamps,
  },
  (table) => [
    index("admin_audit_actor_idx").on(table.actorUserId),
    index("admin_audit_org_idx").on(table.targetOrganizationId),
    index("admin_audit_resource_idx").on(table.resourceType, table.resourceId),
  ],
);

export const platformAdminsRelations = relations(platformAdmins, ({ one }) => ({
  user: one(users, { fields: [platformAdmins.userId], references: [users.id] }),
  grantedBy: one(users, { fields: [platformAdmins.grantedByUserId], references: [users.id] }),
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  actor: one(users, { fields: [adminAuditLog.actorUserId], references: [users.id] }),
  organization: one(organizations, {
    fields: [adminAuditLog.targetOrganizationId],
    references: [organizations.id],
  }),
}));
