/**
 * Integration: the development seed (R4a). It must produce a representative
 * account — org, user, connectors, budgets, hosted agents, a message thread,
 * a prepaid credit, and two weeks of historical jobs — and be safe to run
 * repeatedly: a second run creates nothing new and never double-charges the
 * append-only ledger.
 */

import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { seed } from "@/lib/db/seed";
import { balanceForOrg } from "@/modules/billing/credit-service";
import { getPlatformTimeseries } from "@/modules/admin/metrics";
import { createTestDb, type TestDb } from "./harness";

async function orgId(db: TestDb): Promise<string> {
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, "demo"));
  return org!.id;
}

async function counts(db: TestDb, organizationId: string) {
  const one = async (table: typeof schema.jobs) =>
    Number(
      (
        await db
          .select({ c: sql<string>`count(*)` })
          .from(table)
          .where(eq((table as typeof schema.jobs).organizationId, organizationId))
      )[0]!.c,
    );
  return {
    jobs: await one(schema.jobs),
    agents: await one(schema.agentInstances as unknown as typeof schema.jobs),
    ledger: await one(schema.usageLedgerEntries as unknown as typeof schema.jobs),
    budgets: await one(schema.budgets as unknown as typeof schema.jobs),
    messages: await one(schema.agentMessages as unknown as typeof schema.jobs),
  };
}

describe("integration: development seed", () => {
  it("produces a representative, ledger-consistent account", async () => {
    const { db } = await createTestDb();
    await seed(db);
    const organizationId = await orgId(db);
    const c = await counts(db, organizationId);

    expect(c.agents).toBe(3);
    expect(c.budgets).toBe(2);
    expect(c.messages).toBe(2);
    expect(c.jobs).toBeGreaterThanOrEqual(28); // ~2-4 jobs/day over 14 days

    // The activity chart has real data across the window.
    const { days } = await getPlatformTimeseries({ days: 14 }, db);
    expect(days).toHaveLength(14);
    const totalJobs = days.reduce((a, d) => a + d.jobs, 0);
    expect(totalJobs).toBe(c.jobs);
    expect(days.some((d) => d.spendMinor > 0)).toBe(true);
    expect(days.some((d) => d.failed > 0)).toBe(true);

    // Balance = 500_000 prepaid credit − reconciled succeeded-job charges,
    // all integer minor units. Every charge is a real debit, so it's < credit.
    const balance = await balanceForOrg(organizationId, "USD", db);
    expect(Number.isInteger(balance)).toBe(true);
    expect(balance).toBeLessThan(500_000);
    expect(balance).toBeGreaterThan(0);
  });

  it("is idempotent: a second run adds nothing and never double-charges", async () => {
    const { db } = await createTestDb();
    await seed(db);
    const organizationId = await orgId(db);
    const before = await counts(db, organizationId);
    const balanceBefore = await balanceForOrg(organizationId, "USD", db);

    await seed(db);
    const after = await counts(db, organizationId);
    const balanceAfter = await balanceForOrg(organizationId, "USD", db);

    expect(after).toEqual(before);
    expect(balanceAfter).toBe(balanceBefore);
  });
});
