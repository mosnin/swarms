/**
 * Integration tests for GET /api/v1/usage.
 *
 * We call the route handler directly with the dev SESSION_USER_HEADER and
 * seed ledger entries directly to verify period and category breakdowns.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { GET } from "@/app/api/v1/usage/route";

function makeRequest(userId: string): NextRequest {
  return new NextRequest("http://test.local/api/v1/usage", {
    method: "GET",
    headers: { [SESSION_USER_HEADER]: userId },
  });
}

describe("integration: GET /api/v1/usage", () => {
  let db: TestDb;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });

  afterEach(() => {
    __setTestDb(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const req = new NextRequest("http://test.local/api/v1/usage", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns zero totals when no charges have been recorded", async () => {
    const { userId } = await seedOrg(db, "org-usage-1");

    const res = await GET(makeRequest(userId));
    expect(res.status).toBe(200);

    const body = await res.json() as {
      data: {
        periods: { today: number; last7days: number; last30days: number };
        breakdown: { swarms: number; jobs: number };
        totalJobs: number;
        totalSwarmRuns: number;
        currency: string;
      };
    };
    expect(body.data.periods.today).toBe(0);
    expect(body.data.periods.last7days).toBe(0);
    expect(body.data.periods.last30days).toBe(0);
    expect(body.data.breakdown.swarms).toBe(0);
    expect(body.data.breakdown.jobs).toBe(0);
    expect(body.data.totalJobs).toBe(0);
    expect(body.data.currency).toBe("USD");
  });

  it("sums debit charge entries into period totals", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-usage-2");

    // Insert two standalone charge entries (no jobId so no unique constraint issue).
    await db.insert(schema.usageLedgerEntries).values([
      {
        organizationId,
        direction: "debit",
        kind: "charge",
        amountMinor: 150,
        currency: "USD",
        description: "test charge 1",
      },
      {
        organizationId,
        direction: "debit",
        kind: "charge",
        amountMinor: 75,
        currency: "USD",
        description: "test charge 2",
      },
    ]);

    const res = await GET(makeRequest(userId));
    expect(res.status).toBe(200);

    const body = await res.json() as { data: { periods: { today: number; last30days: number } } };
    expect(body.data.periods.today).toBe(225);
    expect(body.data.periods.last30days).toBe(225);
  });

  it("excludes credit entries from totals", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-usage-3");

    await db.insert(schema.usageLedgerEntries).values([
      { organizationId, direction: "debit", kind: "charge", amountMinor: 100, currency: "USD", description: "charge" },
      { organizationId, direction: "credit", kind: "refund", amountMinor: 50, currency: "USD", description: "refund" },
    ]);

    const res = await GET(makeRequest(userId));
    const body = await res.json() as { data: { periods: { last30days: number } } };
    expect(body.data.periods.last30days).toBe(100); // only the debit
  });

  it("counts totalSwarmRuns from swarm_runs table", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-usage-4");

    await db.insert(schema.swarmRuns).values([
      { organizationId, idempotencyKey: "r1", status: "succeeded", input: {}, costCurrency: "USD" },
      { organizationId, idempotencyKey: "r2", status: "failed", input: {}, costCurrency: "USD" },
    ]);

    const res = await GET(makeRequest(userId));
    const body = await res.json() as { data: { totalSwarmRuns: number } };
    expect(body.data.totalSwarmRuns).toBe(2);
  });

  it("isolates data by organization", async () => {
    const { organizationId: org1Id, userId: user1Id } = await seedOrg(db, "org-usage-5a");
    const { organizationId: org2Id } = await seedOrg(db, "org-usage-5b");

    // Insert charge for org1 only.
    await db.insert(schema.usageLedgerEntries).values({
      organizationId: org1Id,
      direction: "debit",
      kind: "charge",
      amountMinor: 500,
      currency: "USD",
      description: "org1 charge",
    });

    // Insert charge for org2 (must not appear in org1's results).
    await db.insert(schema.usageLedgerEntries).values({
      organizationId: org2Id,
      direction: "debit",
      kind: "charge",
      amountMinor: 999,
      currency: "USD",
      description: "org2 charge",
    });

    const res = await GET(makeRequest(user1Id));
    const body = await res.json() as { data: { periods: { last30days: number } } };
    expect(body.data.periods.last30days).toBe(500); // only org1's charge
  });
});
