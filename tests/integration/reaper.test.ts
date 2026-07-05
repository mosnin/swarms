/**
 * Integration: the reaper (reapExpiredJobs) recovers jobs whose worker died.
 * - A lease-expired job with attempts remaining is REQUEUED (keeps its hold),
 *   not permanently failed — so a pod eviction no longer destroys paid work.
 * - A lease-expired job that has exhausted its attempts is failed and its hold
 *   released.
 * - A job that finished between select and update is left untouched (CAS guard).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { reapExpiredJobs } from "@/modules/execution/worker";
import { reserveBudget } from "@/server/budget/reserveBudget";
import { scopedEntriesSince } from "@/server/budget/ledgerQueries";
import { createTestDb, seedOrg, type TestDb } from "./harness";

const LONG_AGO = new Date(Date.now() - 60 * 60 * 1000); // 1h ago (well past lease)

async function insertRunningJob(
  db: TestDb,
  organizationId: string,
  opts: { attempt: number; maxAttempts: number; startedAt?: Date },
): Promise<string> {
  const [job] = await db
    .insert(schema.jobs)
    .values({
      organizationId,
      capabilityKind: "agent",
      task: "t",
      idempotencyKey: `reap-${Math.round(opts.startedAt?.getTime() ?? 0)}-${opts.attempt}-${opts.maxAttempts}-${Math.round(LONG_AGO.getTime())}${organizationId}`,
      inputHash: "h",
      input: { task: "t" },
      status: "running",
      attempt: opts.attempt,
      maxAttempts: opts.maxAttempts,
      costMinor: 0,
      costCurrency: "USD",
      startedAt: opts.startedAt ?? LONG_AGO,
    })
    .returning();
  if (!job) throw new Error("insert failed");
  return job.id;
}

async function heldMinor(db: TestDb, organizationId: string): Promise<number> {
  const entries = await scopedEntriesSince(organizationId, new Date(0), {}, db, "USD");
  return entries.reduce(
    (s, e) => s + (e.kind === "hold" ? e.amountMinor : e.kind === "release" ? -e.amountMinor : 0),
    0,
  );
}

describe("integration: reaper", () => {
  let db: TestDb;
  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => __setTestDb(undefined));

  it("requeues a lease-expired job with attempts remaining and keeps its hold", async () => {
    const { organizationId } = await seedOrg(db, "org-reap-1");
    const jobId = await insertRunningJob(db, organizationId, { attempt: 1, maxAttempts: 3 });
    await reserveBudget({ organizationId, jobId, amountMinor: 200, currency: "USD" }, db);

    const reaped = await reapExpiredJobs(db);
    expect(reaped).toBe(1);

    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(job?.status).toBe("queued"); // requeued, not failed
    expect(job?.startedAt).toBeNull();
    // Hold is retained across the retry (net held = 200).
    expect(await heldMinor(db, organizationId)).toBe(200);
  });

  it("fails and releases a lease-expired job that exhausted its attempts", async () => {
    const { organizationId } = await seedOrg(db, "org-reap-2");
    const jobId = await insertRunningJob(db, organizationId, { attempt: 3, maxAttempts: 3 });
    await reserveBudget({ organizationId, jobId, amountMinor: 200, currency: "USD" }, db);

    const reaped = await reapExpiredJobs(db);
    expect(reaped).toBe(1);

    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(job?.status).toBe("failed");
    // Hold released (net 0) since the job will never run again.
    expect(await heldMinor(db, organizationId)).toBe(0);
  });

  it("leaves a fresh (non-expired) running job untouched", async () => {
    const { organizationId } = await seedOrg(db, "org-reap-3");
    const jobId = await insertRunningJob(db, organizationId, {
      attempt: 1,
      maxAttempts: 3,
      startedAt: new Date(), // just started
    });

    const reaped = await reapExpiredJobs(db);
    expect(reaped).toBe(0);
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(job?.status).toBe("running");
  });
});
