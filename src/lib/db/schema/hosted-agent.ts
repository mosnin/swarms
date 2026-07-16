/**
 * Hosted agents (see docs/HOSTED_AGENTS.md): a persistent agent is a durable
 * DB identity — config, versioned memory, message inbox — executed as
 * discrete, budget-capped wake jobs. The process is disposable; these rows
 * are the agent. Each wake runs through the normal spawn path (policy gate,
 * hard-ceiling reservation, exactly-once charge), so hosted agents inherit
 * every money and audit invariant unchanged.
 */

import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { apiKeys, organizations, users } from "@/lib/db/schema/identity";
import { jobs } from "@/lib/db/schema/execution";
import { amountMinorColumn, currencyColumn, timestamps } from "@/lib/db/schema/_shared";

export const agentInstanceStatus = pgEnum("agent_instance_status", [
  "active",
  "paused",
  "suspended", // platform/billing action, not user-initiated
  "terminated",
]);

export const agentInstances = pgTable(
  "agent_instances",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.agentInstance)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // The principal wakes run as (like schedules); falls back to an operator context.
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    template: varchar("template", { length: 64 }).notNull().default("hermes"),
    // Persona / standing instructions injected into every wake.
    instructions: text("instructions").notNull(),
    model: varchar("model", { length: 96 }).notNull(),
    status: agentInstanceStatus("status").notNull().default("active"),
    // Heartbeat cadence; null = wakes only on inbound messages.
    wakeIntervalMinutes: integer("wake_interval_minutes"),
    nextWakeAt: timestamp("next_wake_at", { withTimezone: true }),
    lastWakeAt: timestamp("last_wake_at", { withTimezone: true }),
    lastJobId: text("last_job_id").references(() => jobs.id, { onDelete: "set null" }),
    // Hard ceiling per wake — passed to the spawn path's reservation.
    budgetMinorPerWake: amountMinorColumn("budget_minor_per_wake").notNull().default(100),
    currency: currencyColumn().notNull().default("USD"),
    // Durable memory: bounded conversation/action history + scratch state.
    // Versioned so concurrent writers can CAS instead of clobbering.
    stateVersion: integer("state_version").notNull().default(0),
    state: jsonb("state").notNull().default({}),
    // Encrypted secrets/resources injected into the sandbox each wake.
    resourceBundleId: text("resource_bundle_id"),
    ...timestamps,
  },
  (table) => [
    index("agent_instances_org_idx").on(table.organizationId),
    index("agent_instances_wake_idx").on(table.status, table.nextWakeAt),
  ],
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.agentMessage)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentInstanceId: text("agent_instance_id")
      .notNull()
      .references(() => agentInstances.id, { onDelete: "cascade" }),
    // "user" = inbound to the agent; "agent" = the agent's reply/report.
    role: varchar("role", { length: 16 }).notNull().default("user"),
    content: text("content").notNull(),
    // The wake job that consumed (user msg) or produced (agent msg) this row.
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("agent_messages_instance_idx").on(table.agentInstanceId, table.processedAt),
    index("agent_messages_org_idx").on(table.organizationId),
    index("agent_messages_job_idx").on(table.jobId),
  ],
);

export const agentInstancesRelations = relations(agentInstances, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agentInstances.organizationId],
    references: [organizations.id],
  }),
  messages: many(agentMessages),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  instance: one(agentInstances, {
    fields: [agentMessages.agentInstanceId],
    references: [agentInstances.id],
  }),
}));
