/**
 * Integration: platform-admin activity timeseries (src/modules/admin/metrics.ts).
 * The series is always exactly `days` long and dense (missing days filled with
 * zero), buckets by UTC day, and sums spend from succeeded jobs only in integer
 * minor units. Day count is clamped to a sane range.
 */

import { describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { clampTimeseriesDays, getPlatformTimeseries } from "@/modules/admin/metrics";
import { createTestDb, seedOrg, type TestDb } from "./harness";

let jobSeq = 0;

async function insertJob(
  db: TestDb,
  organizationId: string,
  opts: { status: string; costMinor: number; createdAt: Date },
): Promise<void> {
  jobSeq += 1;
  await db.insert(schema.jobs).values({
    organizationId,
    capabilityKind: "agent",
    task: "t",
    idempotencyKey: `metrics-${organizationId}-${jobSeq}`,
    inputHash: "h",
    input: { task: "t" },
    status: opts.status as typeof schema.jobs.$inferInsert.status,
    costMinor: opts.costMinor,
    costCurrency: "USD",
    createdAt: opts.createdAt,
  });
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("integration: admin metrics timeseries", () => {
  it("clamps the requested day count to [1, 90] with a default of 14", () => {
    expect(clampTimeseriesDays(undefined)).toBe(14);
    expect(clampTimeseriesDays(0)).toBe(1);
    expect(clampTimeseriesDays(-5)).toBe(1);
    expect(clampTimeseriesDays(7)).toBe(7);
    expect(clampTimeseriesDays(1000)).toBe(90);
    expect(clampTimeseriesDays(3.9)).toBe(3);
    expect(clampTimeseriesDays(Number.NaN)).toBe(14);
  });

  it("returns a dense series and sums spend from succeeded jobs only", async () => {
    const { db } = await createTestDb();
    const { organizationId } = await seedOrg(db);
    const now = new Date();

    // Today: two succeeded (spend 500 + 300), one failed (no spend counted).
    await insertJob(db, organizationId, { status: "succeeded", costMinor: 500, createdAt: now });
    await insertJob(db, organizationId, { status: "succeeded", costMinor: 300, createdAt: now });
    await insertJob(db, organizationId, { status: "failed", costMinor: 999, createdAt: now });

    const { days } = await getPlatformTimeseries({ days: 14 }, db);
    expect(days).toHaveLength(14);

    // Dense: strictly increasing UTC dates, no gaps.
    for (const d of days) expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const last = days[days.length - 1]!;
    expect(last.date).toBe(todayUtc());
    expect(last.jobs).toBe(3);
    expect(last.succeeded).toBe(2);
    expect(last.failed).toBe(1);
    expect(last.spendMinor).toBe(800); // failed job's cost is excluded
    expect(Number.isInteger(last.spendMinor)).toBe(true);

    // Days with no activity are present and zeroed.
    const empty = days[0]!;
    expect(empty.jobs).toBe(0);
    expect(empty.spendMinor).toBe(0);
  });

  it("respects the clamped window length", async () => {
    const { db } = await createTestDb();
    await seedOrg(db);
    const { days } = await getPlatformTimeseries({ days: 1000 }, db);
    expect(days).toHaveLength(90);
  });
});
