/** Artifacts: files produced by runs, plus the LOCAL DEV blob store. */

import { relations } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { idFactory, IdPrefix } from "@/lib/ids";
import { organizations, users } from "@/lib/db/schema/identity";
import { jobs } from "@/lib/db/schema/execution";
import { timestamps } from "@/lib/db/schema/_shared";

/**
 * An artifact: a file a run produced (report, CSV, transcript, image). The bytes
 * live in the object store under `storageKey`; this row is the metadata + access
 * control record. Org-scoped; optionally linked to the run that produced it.
 */
export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.artifact)),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Producing run (any one of these, or none for a directly-uploaded artifact).
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    swarmRunId: text("swarm_run_id"),
    simulationRunId: text("simulation_run_id"),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    filename: varchar("filename", { length: 512 }).notNull(),
    contentType: varchar("content_type", { length: 128 }).notNull().default("application/octet-stream"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    // Object-store location. `provider` records which adapter wrote it so the
    // download path knows whether to stream (db) or redirect to a signed URL (s3).
    storageProvider: varchar("storage_provider", { length: 16 }).notNull(),
    storageKey: text("storage_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("artifacts_org_idx").on(table.organizationId),
    index("artifacts_job_idx").on(table.jobId),
    index("artifacts_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const artifactsRelations = relations(artifacts, ({ one }) => ({
  organization: one(organizations, { fields: [artifacts.organizationId], references: [organizations.id] }),
  job: one(jobs, { fields: [artifacts.jobId], references: [jobs.id] }),
}));

/**
 * LOCAL DEV ADAPTER blob store. Bytes are base64-encoded in a text column so the
 * store works identically on PGlite (tests) and postgres-js (dev) without bytea
 * driver quirks. Production uses the S3 adapter and never writes here.
 */
export const objectBlobs = pgTable(
  "object_blobs",
  {
    id: text("id").primaryKey().$defaultFn(idFactory(IdPrefix.objectBlob)),
    storageKey: text("storage_key").notNull(),
    contentType: varchar("content_type", { length: 128 }).notNull().default("application/octet-stream"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    dataBase64: text("data_base64").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("object_blobs_key_uq").on(table.storageKey)],
);
