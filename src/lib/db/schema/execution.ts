/** Execution: jobs, job steps, worker runs, execution logs. */

import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { apiKeys, organizations, users } from "@/lib/db/schema/identity";
import { skillVersions } from "@/lib/db/schema/catalog";
import { amountMinorColumn, currencyColumn, jobStatus, timestamps } from "@/lib/db/schema/_shared";

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.job)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    capabilityKind: varchar("capability_kind", { length: 16 }).notNull(), // agent | skill | swarm
    skillVersionId: text("skill_version_id").references(() => skillVersions.id, {
      onDelete: "set null",
    }),
    // Agent labor: the task to perform, the inherited resource bundle, and model.
    task: text("task"),
    resourceBundleId: text("resource_bundle_id"),
    model: varchar("model", { length: 96 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    input: jsonb("input").notNull(),
    callbackUrl: text("callback_url"),
    output: jsonb("output"),
    error: jsonb("error"),
    status: jobStatus("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(1),
    costMinor: amountMinorColumn("cost_minor").notNull().default(0),
    costCurrency: currencyColumn("cost_currency").notNull().default("USD"),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    // Idempotency is scoped per org: the same key never runs/charges twice.
    uniqueIndex("jobs_org_idempotency_uq").on(table.organizationId, table.idempotencyKey),
    index("jobs_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const jobSteps = pgTable(
  "job_steps",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.jobStep)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    input: jsonb("input"),
    output: jsonb("output"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("job_steps_job_seq_uq").on(table.jobId, table.seq)],
);

export const workerRuns = pgTable(
  "worker_runs",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.workerRun)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    jobStepId: text("job_step_id").references(() => jobSteps.id, { onDelete: "set null" }),
    skillVersionId: text("skill_version_id").references(() => skillVersions.id, {
      onDelete: "set null",
    }),
    workerId: text("worker_id").notNull(),
    sandboxId: text("sandbox_id"),
    runnerType: varchar("runner_type", { length: 32 }),
    attempt: integer("attempt").notNull().default(0),
    status: jobStatus("status").notNull().default("running"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error"),
    durationMs: integer("duration_ms"),
    costMinor: amountMinorColumn("cost_minor").notNull().default(0),
    costCurrency: currencyColumn("cost_currency").notNull().default("USD"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("worker_runs_job_idx").on(table.jobId)],
);

/** Append-only execution log lines. */
export const executionLogs = pgTable(
  "execution_logs",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.executionLog)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    workerRunId: text("worker_run_id").references(() => workerRuns.id, { onDelete: "set null" }),
    level: varchar("level", { length: 16 }).notNull().default("info"),
    message: text("message").notNull(),
    data: jsonb("data"),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [index("execution_logs_job_idx").on(table.jobId)],
);

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [jobs.organizationId],
    references: [organizations.id],
  }),
  skillVersion: one(skillVersions, {
    fields: [jobs.skillVersionId],
    references: [skillVersions.id],
  }),
  steps: many(jobSteps),
  workerRuns: many(workerRuns),
  logs: many(executionLogs),
}));

export const jobStepsRelations = relations(jobSteps, ({ one }) => ({
  job: one(jobs, { fields: [jobSteps.jobId], references: [jobs.id] }),
}));

export const workerRunsRelations = relations(workerRuns, ({ one }) => ({
  job: one(jobs, { fields: [workerRuns.jobId], references: [jobs.id] }),
}));
