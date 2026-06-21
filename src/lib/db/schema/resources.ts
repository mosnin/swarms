/**
 * Resource bundles: the encrypted context + resources a parent agent hands to a
 * spawned worker agent so it can do real work — the same credentials, files,
 * tools/MCP servers, and task context the parent has outside the platform.
 * The payload is encrypted at rest (envelope encryption); it is only ever
 * decrypted server-side and injected into the agent's sandbox at run time.
 */

import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations, users } from "@/lib/db/schema/identity";
import { timestamps } from "@/lib/db/schema/_shared";

export const resourceBundles = pgTable(
  "resource_bundles",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.resourceBundle)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Envelope-encrypted bundle (env, files, mcpServers, context). Never plaintext. */
    encrypted: text("encrypted").notNull(),
    encryptionKeyId: varchar("encryption_key_id", { length: 64 }).notNull(),
    /** Non-sensitive manifest for display/audit (counts, tool names) — no secrets. */
    summary: jsonb("summary"),
    ...timestamps,
  },
  (table) => [index("resource_bundles_org_idx").on(table.organizationId)],
);

export const resourceBundlesRelations = relations(resourceBundles, ({ one }) => ({
  organization: one(organizations, {
    fields: [resourceBundles.organizationId],
    references: [organizations.id],
  }),
}));
