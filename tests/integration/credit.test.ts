/**
 * Integration: prepaid credits, balance, spend analytics, and auto-reload.
 * All money stays integer minor units in the append-only ledger; balance is
 * credits − debits; auto-reload tops up via the provider port when low.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { fixedClock } from "@/lib/time";
import { userContext } from "@/modules/identity/access-control";
import {
  balanceForOrg,
  getUsageAnalytics,
  grantCredit,
  runDueAutoReloads,
  setAutoReload,
} from "@/modules/billing/credit-service";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";
import { MockTopUpProvider, NoneTopUpProvider, setTopUpProvider } from "@/server/billing/topupProvider";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: credits, balance, analytics, auto-reload", () => {
  let db: TestDb;
  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
    setTopUpProvider(new MockTopUpProvider());
  });
  afterEach(() => {
    setTopUpProvider(undefined);
    __setTestDb(undefined);
  });

  async function ctxFor(slug: string, role: "owner" | "viewer" = "owner") {
    const { organizationId, userId } = await seedOrg(db, slug);
    return { ctx: userContext({ organizationId, userId, membershipId: "m", role }), organizationId };
  }

  it("grants credit and reflects it in the balance", async () => {
    const { ctx, organizationId } = await ctxFor("org-cr-1");
    expect(await balanceForOrg(organizationId, "USD", db)).toBe(0);

    const res = await grantCredit(ctx, { amountMinor: 5_000, currency: "usd", reason: "welcome" }, db);
    expect(res.currency).toBe("USD"); // normalized
    expect(res.balanceMinor).toBe(5_000);
    expect(await balanceForOrg(organizationId, "USD", db)).toBe(5_000);
  });

  it("balance nets debits against credits", async () => {
    const { organizationId } = await ctxFor("org-cr-2");
    const store = dbLedgerStore(db);
    await appendEntry(store, { organizationId, direction: "credit", kind: "credit", amountMinor: 1_000, currency: "USD" });
    await appendEntry(store, { organizationId, direction: "debit", kind: "charge", amountMinor: 300, currency: "USD" });
    expect(await balanceForOrg(organizationId, "USD", db)).toBe(700);
  });

  it("requires billing.manage to grant credit", async () => {
    const { ctx } = await ctxFor("org-cr-3", "viewer");
    await expect(grantCredit(ctx, { amountMinor: 100 }, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("computes spend analytics with burn rate and runway", async () => {
    const { ctx, organizationId } = await ctxFor("org-cr-4");
    const clock = fixedClock(new Date("2026-03-15T12:00:00Z"));
    const store = dbLedgerStore(db);
    await appendEntry(store, { organizationId, direction: "credit", kind: "credit", amountMinor: 3_000, currency: "USD" }, clock);
    // 300 minor charged "today".
    await appendEntry(store, { organizationId, direction: "debit", kind: "charge", amountMinor: 300, currency: "USD" }, clock);

    const usage = await getUsageAnalytics(ctx, { sinceDays: 30, currency: "USD" }, db, clock);
    expect(usage.totalSpentMinor).toBe(300);
    expect(usage.balanceMinor).toBe(2_700); // 3000 - 300
    expect(usage.dailyBurnMinor).toBe(Math.round(300 / 30));
    expect(usage.byDay.length).toBe(1);
    expect(usage.byDay[0]?.spentMinor).toBe(300);
    // runway = balance / dailyBurn (both integers)
    expect(usage.runwayDays).toBe(Math.floor(2_700 / Math.round(300 / 30)));
  });

  it("auto-reload tops up when the balance is below threshold", async () => {
    const { ctx, organizationId } = await ctxFor("org-cr-5");
    const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));
    await setAutoReload(ctx, { enabled: true, thresholdMinor: 1_000, amountMinor: 5_000, currency: "USD" }, db);

    // Balance is 0 (< threshold) → one reload of 5000.
    expect(await runDueAutoReloads(db, clock)).toBe(1);
    expect(await balanceForOrg(organizationId, "USD", db)).toBe(5_000);

    // Now above threshold → no further reload at the same instant.
    expect(await runDueAutoReloads(db, clock)).toBe(0);

    const [cfg] = await db
      .select()
      .from(schema.autoReloadConfigs)
      .where(eq(schema.autoReloadConfigs.organizationId, organizationId));
    expect(cfg?.lastReloadAt).not.toBeNull();
  });

  it("respects the min-interval rate limit", async () => {
    const { ctx, organizationId } = await ctxFor("org-cr-6");
    const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));
    await setAutoReload(
      ctx,
      { enabled: true, thresholdMinor: 100_000, amountMinor: 1_000, currency: "USD", minIntervalSeconds: 3600 },
      db,
    );
    // First reload fires (balance 0 < 100000).
    expect(await runDueAutoReloads(db, clock)).toBe(1);
    // Still below threshold (1000 < 100000) but within the interval → blocked.
    clock.advance(60_000); // +1 min
    expect(await runDueAutoReloads(db, clock)).toBe(0);
    // After the interval elapses → fires again.
    clock.advance(3_600_000); // +1 h
    expect(await runDueAutoReloads(db, clock)).toBe(1);
    expect(await balanceForOrg(organizationId, "USD", db)).toBe(2_000);
  });

  it("records an error and does not credit when the provider declines", async () => {
    setTopUpProvider(new NoneTopUpProvider());
    const { ctx, organizationId } = await ctxFor("org-cr-7");
    const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));
    await setAutoReload(ctx, { enabled: true, thresholdMinor: 1_000, amountMinor: 5_000, currency: "USD" }, db);

    expect(await runDueAutoReloads(db, clock)).toBe(0);
    expect(await balanceForOrg(organizationId, "USD", db)).toBe(0);
    const [cfg] = await db
      .select()
      .from(schema.autoReloadConfigs)
      .where(eq(schema.autoReloadConfigs.organizationId, organizationId));
    expect(cfg?.lastError).toBeTruthy();
  });
});
