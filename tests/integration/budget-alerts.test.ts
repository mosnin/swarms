/**
 * Integration tests for budget threshold alerts (#15).
 *
 * Budget alerts fire when org spend crosses 80% (warning) or 100% (exceeded)
 * of a configured budget in the current period. Alerts are:
 *   - Returned by GET /api/v1/usage as `budgetAlerts`
 *   - Enqueued as webhook deliveries (budget.warning / budget.exceeded)
 *     whenever callbackUrl is provided on a spawnSwarm call
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import { computeBudgetAlerts } from "@/server/budget/budgetAlerts";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { GET } from "@/app/api/v1/usage/route";

describe("integration: budget alerts", () => {
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

  it("returns no alerts when no budgets are configured", async () => {
    const { organizationId } = await seedOrg(db, "org-alert-1");
    const alerts = await computeBudgetAlerts(organizationId, "USD", db);
    expect(alerts).toHaveLength(0);
  });

  it("returns no alerts when spend is below 80%", async () => {
    const { organizationId } = await seedOrg(db, "org-alert-2");

    // Budget of 1000 units; spend only 200 (20%).
    await db.insert(schema.budgets).values({
      organizationId,
      name: "monthly cap",
      limitMinor: 1000,
      currency: "USD",
      period: "monthly",
      hardStop: false,
      spentMinor: 0,
    });

    await db.insert(schema.usageLedgerEntries).values({
      organizationId,
      direction: "debit",
      kind: "charge",
      amountMinor: 200,
      currency: "USD",
      description: "test charge",
    });

    const alerts = await computeBudgetAlerts(organizationId, "USD", db);
    expect(alerts).toHaveLength(0);
  });

  it("returns a warning alert when spend crosses 80%", async () => {
    const { organizationId } = await seedOrg(db, "org-alert-3");

    await db.insert(schema.budgets).values({
      organizationId,
      name: "monthly cap",
      limitMinor: 1000,
      currency: "USD",
      period: "monthly",
      hardStop: false,
      spentMinor: 0,
    });

    // 85% spend.
    await db.insert(schema.usageLedgerEntries).values({
      organizationId,
      direction: "debit",
      kind: "charge",
      amountMinor: 850,
      currency: "USD",
      description: "test charge",
    });

    const alerts = await computeBudgetAlerts(organizationId, "USD", db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.level).toBe("warning");
    expect(alerts[0]?.threshold).toBe(0.8);
    expect(alerts[0]?.spentMinor).toBe(850);
    expect(alerts[0]?.limitMinor).toBe(1000);
    expect(alerts[0]?.usagePercent).toBe(85);
  });

  it("returns an exceeded alert when spend hits 100%", async () => {
    const { organizationId } = await seedOrg(db, "org-alert-4");

    await db.insert(schema.budgets).values({
      organizationId,
      name: "monthly cap",
      limitMinor: 1000,
      currency: "USD",
      period: "monthly",
      hardStop: false,
      spentMinor: 0,
    });

    // 110% spend — exceeded, not just warning.
    await db.insert(schema.usageLedgerEntries).values({
      organizationId,
      direction: "debit",
      kind: "charge",
      amountMinor: 1100,
      currency: "USD",
      description: "over-limit charge",
    });

    const alerts = await computeBudgetAlerts(organizationId, "USD", db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.level).toBe("exceeded");
    expect(alerts[0]?.threshold).toBe(1.0);
    // Only one alert per budget (highest severity suppresses lower).
  });

  it("returns the highest severity only — exceeded suppresses warning", async () => {
    const { organizationId } = await seedOrg(db, "org-alert-5");

    await db.insert(schema.budgets).values({
      organizationId,
      name: "monthly cap",
      limitMinor: 500,
      currency: "USD",
      period: "monthly",
      hardStop: false,
      spentMinor: 0,
    });

    // 100% exactly.
    await db.insert(schema.usageLedgerEntries).values({
      organizationId,
      direction: "debit",
      kind: "charge",
      amountMinor: 500,
      currency: "USD",
    });

    const alerts = await computeBudgetAlerts(organizationId, "USD", db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.level).toBe("exceeded");
  });

  it("enqueues a budget.warning webhook when 80% is crossed and callbackUrl provided", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-alert-6");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // Budget of 10 units; each worker costs 2 (rate=2, 1 GPU-second default).
    // Seed 8 units of prior spend (80%) before the swarm.
    await db.insert(schema.budgets).values({
      organizationId,
      name: "tight cap",
      limitMinor: 10,
      currency: "USD",
      period: "monthly",
      hardStop: false,
      spentMinor: 0,
    });
    await db.insert(schema.usageLedgerEntries).values({
      organizationId,
      direction: "debit",
      kind: "charge",
      amountMinor: 8,
      currency: "USD",
      description: "prior spend",
    });

    // Spawn 1 worker (costs 2 minor) — total becomes 10/10 = 100% → exceeded.
    await spawnSwarm(
      ctx,
      {
        tasks: ["task A"],
        budgetMinor: 100,
        idempotencyKey: "alert-wh-1",
        callbackUrl: "https://hooks.example.com/budget",
      },
      db,
    );

    // Wait for fire-and-forget enqueues to land.
    await new Promise((r) => setTimeout(r, 80));

    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));

    // Expect the swarm.succeeded webhook plus at least one budget alert.
    const swarmEvent = deliveries.find((d) => d.eventType === "swarm.succeeded");
    const budgetEvent = deliveries.find(
      (d) => d.eventType === "budget.warning" || d.eventType === "budget.exceeded",
    );
    expect(swarmEvent).toBeDefined();
    expect(budgetEvent).toBeDefined();
    expect(budgetEvent?.url).toBe("https://hooks.example.com/budget");
  });

  it("does NOT enqueue budget alerts when no callbackUrl is provided", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-alert-7");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await db.insert(schema.budgets).values({
      organizationId,
      name: "cap",
      limitMinor: 1,
      currency: "USD",
      period: "monthly",
      hardStop: false,
      spentMinor: 0,
    });

    // Already over budget — budget alerts WOULD fire, but no callbackUrl.
    await db.insert(schema.usageLedgerEntries).values({
      organizationId,
      direction: "debit",
      kind: "charge",
      amountMinor: 100,
      currency: "USD",
    });

    await spawnSwarm(
      ctx,
      { tasks: ["task A"], budgetMinor: 200, idempotencyKey: "alert-no-url-1" },
      db,
    );
    await new Promise((r) => setTimeout(r, 50));

    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    expect(deliveries).toHaveLength(0);
  });

  it("GET /api/v1/usage includes budgetAlerts in response", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-alert-8");

    await db.insert(schema.budgets).values({
      organizationId,
      name: "monthly cap",
      limitMinor: 100,
      currency: "USD",
      period: "monthly",
      hardStop: false,
      spentMinor: 0,
    });

    // 90% spend.
    await db.insert(schema.usageLedgerEntries).values({
      organizationId,
      direction: "debit",
      kind: "charge",
      amountMinor: 90,
      currency: "USD",
    });

    const req = new NextRequest("http://test.local/api/v1/usage", {
      headers: { [SESSION_USER_HEADER]: userId },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json() as {
      data: {
        budgetAlerts: Array<{ level: string; threshold: number; usagePercent: number }>;
      };
    };
    expect(Array.isArray(body.data.budgetAlerts)).toBe(true);
    expect(body.data.budgetAlerts).toHaveLength(1);
    expect(body.data.budgetAlerts[0]?.level).toBe("warning");
    expect(body.data.budgetAlerts[0]?.threshold).toBe(0.8);
    expect(body.data.budgetAlerts[0]?.usagePercent).toBe(90);
  });
});
