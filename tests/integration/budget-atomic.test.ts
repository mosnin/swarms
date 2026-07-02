import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { scopedEntriesSince } from "@/server/budget/ledgerQueries";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, enqueueAgentJob, seedOrg, type TestDb } from "./harness";

/**
 * The check-and-reserve path (`checkAndReserveBudget`) recomputes spend and
 * appends the hold inside ONE transaction, with the applicable hard-stop budget
 * rows locked `FOR UPDATE`. True multi-connection lock contention can only be
 * exercised against a real Postgres — PGlite is single-connection, so these
 * tests assert the transactional ceiling + all-or-nothing semantics sequentially.
 * The `FOR UPDATE` serialization itself is a Postgres guarantee.
 */
describe("integration: atomic check-and-reserve", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  async function totalHeld(organizationId: string): Promise<number> {
    const entries = await scopedEntriesSince(organizationId, new Date(0), {}, db, "USD");
    return entries.reduce((s, e) => s + (e.kind === "hold" ? e.amountMinor : 0), 0);
  }

  it("holds up to the cap and rejects the reservation that would exceed it", async () => {
    const { organizationId } = await seedOrg(db);
    await db.insert(schema.budgets).values({
      organizationId,
      name: "org-cap",
      scope: {},
      limitMinor: 1000,
      currency: "USD",
      period: "monthly",
      hardStop: true,
    });

    // 1 GPU-sec × 600 = 600 held.
    const j1 = await enqueueAgentJob(db, {
      organizationId,
      idempotencyKey: "cap-1",
      maxGpuSeconds: 1,
      rateMinorPerSecond: 600,
    });
    expect(j1.status).toBe("queued");
    expect(await totalHeld(organizationId)).toBe(600);

    // Second 600 would push held to 1200 > 1000 → rejected, and NO partial hold.
    await expect(
      enqueueAgentJob(db, {
        organizationId,
        idempotencyKey: "cap-2",
        maxGpuSeconds: 1,
        rateMinorPerSecond: 600,
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });

    // All-or-nothing: the rejected reservation left the ledger untouched at 600.
    expect(await totalHeld(organizationId)).toBe(600);
  });
});
