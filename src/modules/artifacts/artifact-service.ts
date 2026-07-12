/**
 * Artifact service — files produced by runs (reports, CSVs, transcripts,
 * images). Bytes go to the object store behind its port; this records the
 * metadata + access-control row and hands back time-bounded downloads.
 *
 * `storeArtifact` is callable from a runner/system path (no AuthContext needed);
 * `uploadArtifact`/`listArtifacts`/`getArtifact` are the authenticated surface.
 */

import { and, desc, eq, lt } from "drizzle-orm";
import { createHash } from "node:crypto";

import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { newId, IdPrefix } from "@/lib/ids";
import { requireOrganization, requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { getObjectStore } from "@/server/storage/objectStore";
import { systemClock, type Clock } from "@/lib/time";

type Db = ReturnType<typeof getDb>;

export interface ArtifactView {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  jobId: string | null;
  swarmRunId: string | null;
  simulationRunId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

function toView(row: typeof schema.artifacts.$inferSelect): ArtifactView {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    jobId: row.jobId,
    swarmRunId: row.swarmRunId,
    simulationRunId: row.simulationRunId,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface StoreArtifactInput {
  organizationId: string;
  bytes: Buffer;
  filename: string;
  contentType?: string;
  jobId?: string | null;
  swarmRunId?: string | null;
  simulationRunId?: string | null;
  createdByUserId?: string | null;
}

/**
 * Store bytes as an artifact. Enforces the size cap, computes a content hash for
 * integrity, writes to the object store, and records the row with a retention
 * expiry. Safe to call from a runner (no auth context) — the caller is
 * responsible for having authorized the producing run.
 */
export async function storeArtifact(
  input: StoreArtifactInput,
  db: Db = getDb(),
  clock: Clock = systemClock,
): Promise<ArtifactView> {
  const max = env.ARTIFACT_MAX_BYTES ?? 26_214_400;
  if (input.bytes.length === 0) throw Errors.validation("Artifact is empty");
  if (input.bytes.length > max) {
    throw Errors.validation(`Artifact exceeds the ${max}-byte limit`, { sizeBytes: input.bytes.length, max });
  }
  const filename = input.filename.trim().slice(0, 512) || "artifact";
  const contentType = input.contentType?.slice(0, 128) || "application/octet-stream";
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  const id = newId(IdPrefix.artifact);
  const storageKey = `org/${input.organizationId}/${id}/${filename}`;
  const store = getObjectStore();
  const put = await store.put(storageKey, input.bytes, contentType);

  const retentionDays = env.ARTIFACT_RETENTION_DAYS ?? 90;
  const expiresAt = retentionDays > 0 ? new Date(clock.now().getTime() + retentionDays * 86_400_000) : null;

  const row = (
    await db
      .insert(schema.artifacts)
      .values({
        id,
        organizationId: input.organizationId,
        jobId: input.jobId ?? null,
        swarmRunId: input.swarmRunId ?? null,
        simulationRunId: input.simulationRunId ?? null,
        createdByUserId: input.createdByUserId ?? null,
        filename,
        contentType,
        sizeBytes: input.bytes.length,
        sha256,
        storageProvider: put.provider,
        storageKey: put.storageKey,
        expiresAt,
      })
      .returning()
  )[0];
  if (!row) throw Errors.internal("Failed to record artifact");
  return toView(row);
}

/** Authenticated upload (jobs.create). Optionally links to a producing run. */
export async function uploadArtifact(
  ctx: AuthContext,
  input: Omit<StoreArtifactInput, "organizationId" | "createdByUserId">,
  db: Db = getDb(),
): Promise<ArtifactView> {
  requirePermission(ctx, "jobs.create");
  return storeArtifact(
    {
      ...input,
      organizationId: ctx.organizationId,
      createdByUserId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
    },
    db,
  );
}

export async function listArtifacts(
  ctx: AuthContext,
  opts: { jobId?: string; limit?: number } = {},
  db: Db = getDb(),
): Promise<ArtifactView[]> {
  requirePermission(ctx, "jobs.read");
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions = [eq(schema.artifacts.organizationId, ctx.organizationId)];
  if (opts.jobId) conditions.push(eq(schema.artifacts.jobId, opts.jobId));
  const rows = await db
    .select()
    .from(schema.artifacts)
    .where(and(...conditions))
    .orderBy(desc(schema.artifacts.createdAt))
    .limit(limit);
  return rows.map(toView);
}

async function loadOwned(ctx: AuthContext, id: string, db: Db): Promise<typeof schema.artifacts.$inferSelect> {
  const row = (await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id)).limit(1))[0];
  if (!row) throw Errors.notFound("Artifact not found");
  requireOrganization(ctx, row.organizationId);
  return row;
}

export async function getArtifact(ctx: AuthContext, id: string, db: Db = getDb()): Promise<ArtifactView> {
  requirePermission(ctx, "jobs.read");
  return toView(await loadOwned(ctx, id, db));
}

export type ArtifactDownload =
  | { kind: "redirect"; url: string; filename: string }
  | { kind: "stream"; bytes: Buffer; contentType: string; filename: string };

/** Resolve a download: a signed URL (s3) or the bytes to stream (db adapter). */
export async function getArtifactDownload(
  ctx: AuthContext,
  id: string,
  db: Db = getDb(),
): Promise<ArtifactDownload> {
  requirePermission(ctx, "jobs.read");
  const row = await loadOwned(ctx, id, db);
  const store = getObjectStore();
  const url = await store.signedDownloadUrl(row.storageKey, row.filename);
  if (url) return { kind: "redirect", url, filename: row.filename };
  const blob = await store.get(row.storageKey);
  if (!blob) throw Errors.notFound("Artifact bytes are no longer available");
  return { kind: "stream", bytes: blob.bytes, contentType: blob.contentType, filename: row.filename };
}

/**
 * Retention reaper: delete artifacts past their `expiresAt`, removing both the
 * object-store bytes and the metadata row. Called periodically by the worker.
 */
export async function reapExpiredArtifacts(db: Db = getDb(), clock: Clock = systemClock): Promise<number> {
  const now = clock.now();
  const expired = await db
    .select()
    .from(schema.artifacts)
    .where(lt(schema.artifacts.expiresAt, now))
    .limit(100);
  const store = getObjectStore();
  let reaped = 0;
  for (const row of expired) {
    await store.delete(row.storageKey).catch(() => undefined);
    await db.delete(schema.artifacts).where(eq(schema.artifacts.id, row.id));
    reaped += 1;
  }
  return reaped;
}
