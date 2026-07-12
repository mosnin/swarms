/** Evaluations: LLM-as-judge quality scoring of content or a prior run. */

import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations } from "@/lib/db/schema/identity";
import { jobs } from "@/lib/db/schema/execution";
import { amountMinorColumn, currencyColumn, jobStatus, timestamps } from "@/lib/db/schema/_shared";

/**
 * An evaluation run: a judge scores `content` (or a referenced run's output)
 * against a rubric, producing per-criterion scores and a weighted overall.
 * Executed as a normal charged job (one judge call, metered GPU), so it inherits
 * the budget/ledger/audit spine.
 */
export const evaluations = pgTable(
  "evaluations",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.evaluation)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    directorJobId: text("director_job_id").references(() => jobs.id, { onDelete: "set null" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    // What is being judged: free text, or the output of a prior run.
    subjectType: varchar("subject_type", { length: 16 }).notNull(), // text | job | swarm | simulation
    subjectId: text("subject_id"),
    rubric: jsonb("rubric").notNull(), // { criteria: [{ name, description?, weight? }], threshold? }
    status: jobStatus("status").notNull().default("queued"),
    scores: jsonb("scores"), // [{ criterion, score, reasoning }]
    overallScore: integer("overall_score"), // 0..100 weighted
    passed: boolean("passed"),
    model: varchar("model", { length: 96 }),
    gpuSeconds: integer("gpu_seconds").notNull().default(0),
    costMinor: amountMinorColumn("cost_minor").notNull().default(0),
    costCurrency: currencyColumn("cost_currency").notNull().default("USD"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("evaluations_org_idx").on(table.organizationId),
    uniqueIndex("evaluations_org_idempotency_uq").on(table.organizationId, table.idempotencyKey),
    index("evaluations_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  organization: one(organizations, { fields: [evaluations.organizationId], references: [organizations.id] }),
  director: one(jobs, { fields: [evaluations.directorJobId], references: [jobs.id] }),
}));
