/** Simulations: CrewAI simulation runs and their per-persona agent records. */

import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations } from "@/lib/db/schema/identity";
import { jobs } from "@/lib/db/schema/execution";
import { amountMinorColumn, currencyColumn, jobStatus, timestamps } from "@/lib/db/schema/_shared";

/**
 * A simulation run: N CrewAI agents executed inside one Modal sandbox, in
 * `parallel` or `collaborative` mode. Analogous to swarm_runs but the whole crew
 * runs in a single sandbox, so the run is charged once (base fee per agent +
 * metered GPU) rather than per child job.
 */
export const simulationRuns = pgTable(
  "simulation_runs",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.simulationRun)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The director job that executes this simulation on the worker.
    directorJobId: text("director_job_id").references(() => jobs.id, { onDelete: "set null" }),
    // Idempotency is required (learned from the nullable swarm_runs key): the same
    // key never runs/charges twice.
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    mode: varchar("mode", { length: 16 }).notNull(), // parallel | collaborative
    frameworkId: varchar("framework_id", { length: 64 }),
    status: jobStatus("status").notNull().default("queued"),
    input: jsonb("input"), // the validated SimulationConfig
    output: jsonb("output"), // { byPersona, findings, transcript?, aggregatorOutput? }
    costMinor: amountMinorColumn("cost_minor").notNull().default(0),
    // Cost breakdown (reconcilable to costMinor): base fee vs metered compute.
    baseFeeMinor: amountMinorColumn("base_fee_minor").notNull().default(0),
    gpuSeconds: integer("gpu_seconds").notNull().default(0),
    costCurrency: currencyColumn("cost_currency").notNull().default("USD"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("simulation_runs_org_idx").on(table.organizationId),
    uniqueIndex("simulation_runs_org_idempotency_uq").on(table.organizationId, table.idempotencyKey),
    index("simulation_runs_org_status_created_idx").on(table.organizationId, table.status, table.createdAt),
  ],
);

/**
 * A per-persona record within a simulation run. Records only — NOT separately
 * billed jobs (the whole crew shares one sandbox and one charge).
 */
export const simulationAgents = pgTable(
  "simulation_agents",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.simulationAgent)),
    simulationRunId: text("simulation_run_id")
      .notNull()
      .references(() => simulationRuns.id, { onDelete: "cascade" }),
    personaName: varchar("persona_name", { length: 255 }).notNull(),
    role: text("role"),
    status: jobStatus("status").notNull().default("queued"),
    output: jsonb("output"),
    error: jsonb("error"),
    ...timestamps,
  },
  (table) => [index("simulation_agents_run_idx").on(table.simulationRunId)],
);

export const simulationRunsRelations = relations(simulationRuns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [simulationRuns.organizationId],
    references: [organizations.id],
  }),
  director: one(jobs, { fields: [simulationRuns.directorJobId], references: [jobs.id] }),
  agents: many(simulationAgents),
}));

export const simulationAgentsRelations = relations(simulationAgents, ({ one }) => ({
  run: one(simulationRuns, {
    fields: [simulationAgents.simulationRunId],
    references: [simulationRuns.id],
  }),
}));
