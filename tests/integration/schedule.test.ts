/**
 * Integration: schedules fire recurring runs through the normal spine. A due
 * schedule enqueues its request (here an agent job) with a per-firing
 * idempotency key; firing is exactly-once across concurrent workers and the
 * counter advances via CAS on nextRunAt.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { fixedClock } from "@/lib/time";
import { userContext } from "@/modules/identity/access-control";
import {
  createSchedule,
  runDueSchedules,
  setScheduleStatus,
} from "@/modules/schedules/schedule-service";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: schedules", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => {
    setJobQueue(undefined);
    __setTestDb(undefined);
  });

  async function ctxFor(slug: string) {
    const { organizationId, userId } = await seedOrg(db, slug);
    return { ctx: userContext({ organizationId, userId, membershipId: "m", role: "owner" }), organizationId };
  }

  it("fires a due schedule and advances the next run", async () => {
    const { ctx } = await ctxFor("org-sched-1");
    // Thursday 2026-01-01 00:00Z; every 5 minutes.
    const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));
    const created = await createSchedule(
      ctx,
      { name: "poller", kind: "agent", cronExpression: "*/5 * * * *", request: { task: "ping", budgetMinor: 200 } },
      db,
      clock,
    );
    expect(created.nextRunAt).toBe("2026-01-01T00:05:00.000Z");

    // Not due yet at creation time.
    expect(await runDueSchedules(db, clock)).toBe(0);

    // Advance to the firing minute.
    clock.set(new Date("2026-01-01T00:05:00Z"));
    expect(await runDueSchedules(db, clock)).toBe(1);

    const [row] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, created.id));
    expect(row?.runCount).toBe(1);
    expect(row?.lastRunRef).toMatch(/^job_/);
    expect(row?.nextRunAt?.toISOString()).toBe("2026-01-01T00:10:00.000Z");

    // The firing actually created an agent job with the per-firing idempotency key.
    const [job] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.idempotencyKey, `${created.id}-2026-01-01T00:05:00.000Z`));
    expect(job?.id).toBe(row?.lastRunRef);
    expect(job?.capabilityKind).toBe("agent");
  });

  it("does not double-fire the same minute (CAS on nextRunAt)", async () => {
    const { ctx } = await ctxFor("org-sched-2");
    const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));
    const created = await createSchedule(
      ctx,
      { name: "p", kind: "agent", cronExpression: "*/5 * * * *", request: { task: "ping", budgetMinor: 200 } },
      db,
      clock,
    );
    clock.set(new Date("2026-01-01T00:05:00Z"));
    // Two ticks at the same instant: the first fires, the second finds nothing due.
    expect(await runDueSchedules(db, clock)).toBe(1);
    expect(await runDueSchedules(db, clock)).toBe(0);

    const [row] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, created.id));
    expect(row?.runCount).toBe(1);
  });

  it("a paused schedule does not fire even when due", async () => {
    const { ctx } = await ctxFor("org-sched-3");
    const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));
    const created = await createSchedule(
      ctx,
      { name: "p", kind: "agent", cronExpression: "*/5 * * * *", request: { task: "ping", budgetMinor: 200 } },
      db,
      clock,
    );
    await setScheduleStatus(ctx, created.id, "paused", db, clock);

    clock.set(new Date("2026-01-01T00:05:00Z"));
    expect(await runDueSchedules(db, clock)).toBe(0);

    const [row] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, created.id));
    expect(row?.runCount).toBe(0);
  });

  it("rejects an invalid cron expression", async () => {
    const { ctx } = await ctxFor("org-sched-4");
    await expect(
      createSchedule(ctx, { name: "bad", kind: "agent", cronExpression: "not a cron", request: { task: "x" } }, db),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a malformed request body for the kind", async () => {
    const { ctx } = await ctxFor("org-sched-5");
    await expect(
      createSchedule(ctx, { name: "bad", kind: "agent", cronExpression: "* * * * *", request: { notTask: 1 } }, db),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
