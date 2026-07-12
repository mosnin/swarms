/**
 * Integration: artifacts store bytes behind the object-store port (DB adapter in
 * tests), record content-hashed metadata, stream downloads, and are removed by
 * the retention reaper once expired.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { fixedClock } from "@/lib/time";
import { userContext } from "@/modules/identity/access-control";
import {
  getArtifactDownload,
  listArtifacts,
  reapExpiredArtifacts,
  storeArtifact,
  uploadArtifact,
} from "@/modules/artifacts/artifact-service";
import { DbObjectStore, setObjectStore } from "@/server/storage/objectStore";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, enqueueAgentJob, seedOrg, type TestDb } from "./harness";

describe("integration: artifacts", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
    setObjectStore(new DbObjectStore(db));
  });
  afterEach(() => {
    setJobQueue(undefined);
    setObjectStore(undefined);
    __setTestDb(undefined);
  });

  it("stores, lists, and streams back an artifact with a correct hash", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-art-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const bytes = Buffer.from("# Executive brief\nfindings...\n", "utf8");

    const created = await uploadArtifact(ctx, { bytes, filename: "brief.md", contentType: "text/markdown" }, db);
    expect(created.sizeBytes).toBe(bytes.length);
    expect(created.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));

    const list = await listArtifacts(ctx, {}, db);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);

    const dl = await getArtifactDownload(ctx, created.id, db);
    expect(dl.kind).toBe("stream");
    if (dl.kind === "stream") {
      expect(dl.bytes.equals(bytes)).toBe(true);
      expect(dl.contentType).toBe("text/markdown");
    }
  });

  it("links an artifact to a producing run and filters by jobId", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-art-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const jobX = await enqueueAgentJob(db, { organizationId, userId, idempotencyKey: "art-jobx", task: "x" });
    const jobY = await enqueueAgentJob(db, { organizationId, userId, idempotencyKey: "art-joby", task: "y" });
    await storeArtifact({ organizationId, bytes: Buffer.from("a"), filename: "a.txt", jobId: jobX.jobId }, db);
    await storeArtifact({ organizationId, bytes: Buffer.from("b"), filename: "b.txt", jobId: jobY.jobId }, db);

    const onlyX = await listArtifacts(ctx, { jobId: jobX.jobId }, db);
    expect(onlyX).toHaveLength(1);
    expect(onlyX[0]?.filename).toBe("a.txt");
  });

  it("rejects an empty artifact", async () => {
    const { organizationId } = await seedOrg(db, "org-art-3");
    await expect(
      storeArtifact({ organizationId, bytes: Buffer.alloc(0), filename: "empty.bin" }, db),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("reaps artifacts past their retention window", async () => {
    const { organizationId } = await seedOrg(db, "org-art-4");
    const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));
    const created = await storeArtifact({ organizationId, bytes: Buffer.from("keep-me"), filename: "r.txt" }, db, clock);

    // Not yet expired (default 90-day retention).
    clock.set(new Date("2026-02-01T00:00:00Z"));
    expect(await reapExpiredArtifacts(db, clock)).toBe(0);

    // Past retention → removed (metadata + blob).
    clock.set(new Date("2026-06-01T00:00:00Z"));
    expect(await reapExpiredArtifacts(db, clock)).toBe(1);
    const rows = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, created.id));
    expect(rows).toHaveLength(0);
    const blobs = await db
      .select()
      .from(schema.objectBlobs)
      .where(eq(schema.objectBlobs.storageKey, `org/${organizationId}/${created.id}/r.txt`));
    expect(blobs).toHaveLength(0);
  });

  it("enforces org isolation on download", async () => {
    const { organizationId } = await seedOrg(db, "org-art-5a");
    const other = await seedOrg(db, "org-art-5b");
    const created = await storeArtifact({ organizationId, bytes: Buffer.from("secret"), filename: "s.txt" }, db);
    const otherCtx = userContext({
      organizationId: other.organizationId,
      userId: other.userId,
      membershipId: "m",
      role: "owner",
    });
    await expect(getArtifactDownload(otherCtx, created.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
