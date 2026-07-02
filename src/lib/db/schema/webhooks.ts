/** Webhooks: registered org endpoints + an append-mostly delivery outbox. */

import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations } from "@/lib/db/schema/identity";
import { jobs } from "@/lib/db/schema/execution";
import { timestamps } from "@/lib/db/schema/_shared";

/**
 * Persisted per-org webhook endpoints. Events (swarm lifecycle, budget alerts)
 * are fanned out to every enabled endpoint for the org, in addition to any
 * per-request callbackUrl. Endpoints are managed via POST/GET/DELETE
 * /api/v1/webhooks.
 */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.webhookEndpoint)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("webhook_endpoints_org_idx").on(table.organizationId)],
);

export const webhookEndpointsRelations = relations(webhookEndpoints, ({ one }) => ({
  organization: one(organizations, {
    fields: [webhookEndpoints.organizationId],
    references: [organizations.id],
  }),
}));

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.webhookDelivery)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    url: text("url").notNull(),
    payload: jsonb("payload").notNull(),
    signature: varchar("signature", { length: 128 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending|delivered|failed
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("webhook_deliveries_status_idx").on(table.status, table.nextAttemptAt),
    index("webhook_deliveries_org_idx").on(table.organizationId),
  ],
);

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  organization: one(organizations, {
    fields: [webhookDeliveries.organizationId],
    references: [organizations.id],
  }),
  job: one(jobs, { fields: [webhookDeliveries.jobId], references: [jobs.id] }),
}));
