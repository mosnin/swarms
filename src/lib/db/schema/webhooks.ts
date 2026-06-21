/** Webhooks: an append-mostly delivery outbox for job lifecycle events. */

import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations } from "@/lib/db/schema/identity";
import { jobs } from "@/lib/db/schema/execution";
import { timestamps } from "@/lib/db/schema/_shared";

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
