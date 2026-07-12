/** Schedules: cron-driven recurring enqueues of agent / swarm / simulation runs. */

import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations, users, apiKeys } from "@/lib/db/schema/identity";
import { timestamps } from "@/lib/db/schema/_shared";

/**
 * A recurring schedule. On each firing the worker enqueues `request` as the
 * given `kind` (a normal agent job, swarm, or simulation), so scheduled runs
 * inherit the whole hardened execution + billing spine — nothing bypasses
 * budgets, policy, or the ledger. Idempotency is per-firing (schedule id + the
 * fired-for minute) so a redelivery never double-enqueues.
 */
export const schedules = pgTable(
  "schedules",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.schedule)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    kind: varchar("kind", { length: 16 }).notNull(), // agent | swarm | simulation
    // The exact request body to enqueue on each firing (validated at create time
    // and re-validated at fire time).
    request: jsonb("request").notNull(),
    cronExpression: varchar("cron_expression", { length: 128 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    status: varchar("status", { length: 16 }).notNull().default("active"), // active | paused
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** Reference to the last enqueued run (jobId or swarm/simulation run id). */
    lastRunRef: text("last_run_ref"),
    lastError: text("last_error"),
    runCount: integer("run_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("schedules_org_idx").on(table.organizationId),
    // The worker's due-scan: active schedules ordered by nextRunAt.
    index("schedules_due_idx").on(table.status, table.nextRunAt),
  ],
);

export const schedulesRelations = relations(schedules, ({ one }) => ({
  organization: one(organizations, {
    fields: [schedules.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, { fields: [schedules.createdByUserId], references: [users.id] }),
  apiKey: one(apiKeys, { fields: [schedules.apiKeyId], references: [apiKeys.id] }),
}));
