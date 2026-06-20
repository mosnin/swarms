/** Swarms: templates, runs, and per-agent members. */

import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations } from "@/lib/db/schema/identity";
import { skillVersions } from "@/lib/db/schema/catalog";
import { jobs } from "@/lib/db/schema/execution";
import {
  amountMinorColumn,
  currencyColumn,
  entityStatus,
  jobStatus,
  skillVisibility,
  timestamps,
} from "@/lib/db/schema/_shared";

export const swarmTemplates = pgTable(
  "swarm_templates",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.swarmTemplate)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 96 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    topology: jsonb("topology").notNull(),
    memberRefs: jsonb("member_refs").notNull(),
    visibility: skillVisibility("visibility").notNull().default("private"),
    priceMinor: amountMinorColumn("price_minor").notNull().default(0),
    priceCurrency: currencyColumn("price_currency").notNull().default("USD"),
    status: entityStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [uniqueIndex("swarm_templates_org_slug_uq").on(table.organizationId, table.slug)],
);

export const swarmRuns = pgTable(
  "swarm_runs",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.swarmRun)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    swarmTemplateId: text("swarm_template_id")
      .notNull()
      .references(() => swarmTemplates.id, { onDelete: "restrict" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    status: jobStatus("status").notNull().default("queued"),
    input: jsonb("input"),
    output: jsonb("output"),
    costMinor: amountMinorColumn("cost_minor").notNull().default(0),
    costCurrency: currencyColumn("cost_currency").notNull().default("USD"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("swarm_runs_template_idx").on(table.swarmTemplateId)],
);

export const swarmAgents = pgTable(
  "swarm_agents",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.swarmAgent)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    swarmRunId: text("swarm_run_id")
      .notNull()
      .references(() => swarmRuns.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 64 }).notNull(),
    skillVersionId: text("skill_version_id").references(() => skillVersions.id, {
      onDelete: "set null",
    }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    status: jobStatus("status").notNull().default("queued"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error"),
    costMinor: amountMinorColumn("cost_minor").notNull().default(0),
    costCurrency: currencyColumn("cost_currency").notNull().default("USD"),
    ...timestamps,
  },
  (table) => [index("swarm_agents_run_idx").on(table.swarmRunId)],
);

export const swarmTemplatesRelations = relations(swarmTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [swarmTemplates.organizationId],
    references: [organizations.id],
  }),
  runs: many(swarmRuns),
}));

export const swarmRunsRelations = relations(swarmRuns, ({ one, many }) => ({
  template: one(swarmTemplates, {
    fields: [swarmRuns.swarmTemplateId],
    references: [swarmTemplates.id],
  }),
  job: one(jobs, { fields: [swarmRuns.jobId], references: [jobs.id] }),
  agents: many(swarmAgents),
}));

export const swarmAgentsRelations = relations(swarmAgents, ({ one }) => ({
  run: one(swarmRuns, { fields: [swarmAgents.swarmRunId], references: [swarmRuns.id] }),
}));
