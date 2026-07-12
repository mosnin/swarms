/** Auto-reload: per-org rule that tops up the balance when it runs low. */

import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations } from "@/lib/db/schema/identity";
import { amountMinorColumn, currencyColumn, timestamps } from "@/lib/db/schema/_shared";

/**
 * A single auto-reload rule per organization. When enabled and the org's
 * available balance drops below `thresholdMinor`, the worker captures
 * `amountMinor` via the configured top-up provider and credits the ledger.
 * `minIntervalSeconds` + `lastReloadAt` rate-limit reloads; the row is locked
 * FOR UPDATE during a reload so concurrent workers never double-charge.
 */
export const autoReloadConfigs = pgTable(
  "auto_reload_configs",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.autoReload)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    thresholdMinor: amountMinorColumn("threshold_minor").notNull(),
    amountMinor: amountMinorColumn("amount_minor").notNull(),
    currency: currencyColumn().notNull().default("USD"),
    minIntervalSeconds: integer("min_interval_seconds").notNull().default(3600),
    lastReloadAt: timestamp("last_reload_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("auto_reload_org_uq").on(table.organizationId),
    index("auto_reload_enabled_idx").on(table.enabled),
  ],
);

export const autoReloadConfigsRelations = relations(autoReloadConfigs, ({ one }) => ({
  organization: one(organizations, {
    fields: [autoReloadConfigs.organizationId],
    references: [organizations.id],
  }),
}));
