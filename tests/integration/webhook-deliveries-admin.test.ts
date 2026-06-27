/**
 * Integration tests for webhook delivery admin endpoints (#17).
 *
 *   GET  /api/v1/webhooks/deliveries             — list with filters + pagination
 *   POST /api/v1/webhooks/deliveries/:id/retry   — reset a failed delivery
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import { deliverPendingWebhooks } from "@/modules/webhooks/webhook-service";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { GET as listDeliveries } from "@/app/api/v1/webhooks/deliveries/route";
import { POST as retryDelivery } from "@/app/api/v1/webhooks/deliveries/[deliveryId]/retry/route";

function makeListReq(userId: string, params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://test.local/api/v1/webhooks/deliveries");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers: { [SESSION_USER_HEADER]: userId } });
}

function makeRetryReq(userId: string): NextRequest {
  return new NextRequest("http://test.local/api/v1/webhooks/deliveries/x/retry", {
    method: "POST",
    headers: { [SESSION_USER_HEADER]: userId },
  });
}

describe("integration: GET /api/v1/webhooks/deliveries", () => {
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

  it("returns 401 when unauthenticated", async () => {
    const res = await listDeliveries(
      new NextRequest("http://test.local/api/v1/webhooks/deliveries"),
    );
    expect(res.status).toBe(401);
  });

  it("returns empty list for a fresh org", async () => {
    const { userId } = await seedOrg(db, "org-wda-1");
    const res = await listDeliveries(makeListReq(userId));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { deliveries: unknown[]; nextCursor: null } };
    expect(body.data.deliveries).toHaveLength(0);
    expect(body.data.nextCursor).toBeNull();
  });

  it("lists deliveries after a swarm with callbackUrl", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-wda-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await spawnSwarm(
      ctx,
      {
        tasks: ["task A", "task B"],
        budgetMinor: 200,
        idempotencyKey: "wda-1",
        callbackUrl: "https://hooks.example.com/list",
      },
      db,
    );
    await new Promise((r) => setTimeout(r, 80));

    const res = await listDeliveries(makeListReq(userId));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: { deliveries: Array<{ eventType: string; status: string; url: string }> };
    };
    expect(body.data.deliveries.length).toBeGreaterThanOrEqual(1);
    expect(body.data.deliveries[0]?.url).toBe("https://hooks.example.com/list");
    expect(body.data.deliveries[0]?.status).toBe("pending");
  });

  it("filters by status", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-wda-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await spawnSwarm(
      ctx,
      { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "wda-2", callbackUrl: "https://hooks.example.com/filter" },
      db,
    );
    await new Promise((r) => setTimeout(r, 80));

    // Deliver it — status becomes "delivered".
    const successFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    await deliverPendingWebhooks(db, successFetch as unknown as typeof fetch);

    const pendingRes = await listDeliveries(makeListReq(userId, { status: "pending" }));
    const pendingBody = await pendingRes.json() as { data: { deliveries: unknown[] } };
    expect(pendingBody.data.deliveries).toHaveLength(0);

    const deliveredRes = await listDeliveries(makeListReq(userId, { status: "delivered" }));
    const deliveredBody = await deliveredRes.json() as {
      data: { deliveries: Array<{ status: string }> };
    };
    expect(deliveredBody.data.deliveries).toHaveLength(1);
    expect(deliveredBody.data.deliveries[0]?.status).toBe("delivered");
  });

  it("filters by eventType", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-wda-4");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // Insert two deliveries with different event types manually.
    await db.insert(schema.webhookDeliveries).values([
      {
        organizationId,
        eventType: "swarm.succeeded",
        url: "https://hooks.example.com/a",
        payload: { type: "swarm.succeeded" },
        signature: "sig1",
        status: "pending",
        nextAttemptAt: new Date(),
      },
      {
        organizationId,
        eventType: "budget.warning",
        url: "https://hooks.example.com/b",
        payload: { type: "budget.warning" },
        signature: "sig2",
        status: "pending",
        nextAttemptAt: new Date(),
      },
    ]);

    const res = await listDeliveries(makeListReq(userId, { eventType: "budget.warning" }));
    const body = await res.json() as {
      data: { deliveries: Array<{ eventType: string }> };
    };
    expect(body.data.deliveries).toHaveLength(1);
    expect(body.data.deliveries[0]?.eventType).toBe("budget.warning");
  });

  it("paginates with limit and nextCursor", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-wda-5");

    for (let i = 0; i < 3; i++) {
      await db.insert(schema.webhookDeliveries).values({
        organizationId,
        eventType: "swarm.succeeded",
        url: `https://hooks.example.com/${i}`,
        payload: { type: "swarm.succeeded" },
        signature: `sig${i}`,
        status: "pending",
        nextAttemptAt: new Date(),
      });
    }

    const page1Res = await listDeliveries(makeListReq(userId, { limit: "2" }));
    const page1 = await page1Res.json() as {
      data: { deliveries: Array<{ id: string }>; nextCursor: string | null };
    };
    expect(page1.data.deliveries).toHaveLength(2);
    expect(page1.data.nextCursor).not.toBeNull();

    const page2Res = await listDeliveries(
      makeListReq(userId, { limit: "2", cursor: page1.data.nextCursor! }),
    );
    const page2 = await page2Res.json() as {
      data: { deliveries: Array<{ id: string }>; nextCursor: string | null };
    };
    expect(page2.data.deliveries).toHaveLength(1);
    expect(page2.data.nextCursor).toBeNull();

    const page1Ids = page1.data.deliveries.map((d) => d.id);
    const page2Ids = page2.data.deliveries.map((d) => d.id);
    expect(page1Ids.every((id) => !page2Ids.includes(id))).toBe(true);
  });

  it("returns 400 for invalid status filter", async () => {
    const { userId } = await seedOrg(db, "org-wda-6");
    const res = await listDeliveries(makeListReq(userId, { status: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("isolates deliveries by org", async () => {
    const { organizationId: org1Id, userId: user1Id } = await seedOrg(db, "org-wda-7a");
    const { organizationId: org2Id, userId: _user2Id } = await seedOrg(db, "org-wda-7b");

    await db.insert(schema.webhookDeliveries).values({
      organizationId: org1Id,
      eventType: "swarm.succeeded",
      url: "https://hooks.example.com/org1",
      payload: {},
      signature: "sig",
      status: "pending",
      nextAttemptAt: new Date(),
    });
    await db.insert(schema.webhookDeliveries).values({
      organizationId: org2Id,
      eventType: "swarm.succeeded",
      url: "https://hooks.example.com/org2",
      payload: {},
      signature: "sig",
      status: "pending",
      nextAttemptAt: new Date(),
    });

    const res = await listDeliveries(makeListReq(user1Id));
    const body = await res.json() as { data: { deliveries: unknown[] } };
    expect(body.data.deliveries).toHaveLength(1);
  });
});

describe("integration: POST /api/v1/webhooks/deliveries/:id/retry", () => {
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

  it("returns 401 when unauthenticated", async () => {
    const req = new NextRequest(
      "http://test.local/api/v1/webhooks/deliveries/x/retry",
      { method: "POST" },
    );
    const res = await retryDelivery(req, { params: Promise.resolve({ deliveryId: "x" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown delivery", async () => {
    const { userId } = await seedOrg(db, "org-wdr-1");
    const req = makeRetryReq(userId);
    const res = await retryDelivery(req, { params: Promise.resolve({ deliveryId: "nonexistent" }) });
    expect(res.status).toBe(404);
  });

  it("resets a failed delivery back to pending", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-wdr-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await spawnSwarm(
      ctx,
      { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "wdr-2", callbackUrl: "https://hooks.example.com/fail" },
      db,
    );
    await new Promise((r) => setTimeout(r, 80));

    // Exhaust all attempts.
    const failFetch = vi.fn(async () => new Response("err", { status: 503 }));
    for (let i = 0; i < 5; i++) {
      // Temporarily move nextAttemptAt into the past to trigger delivery.
      await db
        .update(schema.webhookDeliveries)
        .set({ nextAttemptAt: new Date(0) })
        .where(eq(schema.webhookDeliveries.organizationId, organizationId));
      await deliverPendingWebhooks(db, failFetch as unknown as typeof fetch);
    }

    const [failed] = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId))
      .limit(1);
    expect(failed?.status).toBe("failed");

    const req = new NextRequest(
      `http://test.local/api/v1/webhooks/deliveries/${failed!.id}/retry`,
      { method: "POST", headers: { [SESSION_USER_HEADER]: userId } },
    );
    const res = await retryDelivery(req, {
      params: Promise.resolve({ deliveryId: failed!.id }),
    });
    expect(res.status).toBe(200);

    const [reset] = await db
      .select({ status: schema.webhookDeliveries.status })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.id, failed!.id))
      .limit(1);
    expect(reset?.status).toBe("pending");
  });

  it("returns 409 when retrying an already-delivered delivery", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-wdr-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await spawnSwarm(
      ctx,
      { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "wdr-3", callbackUrl: "https://hooks.example.com/ok" },
      db,
    );
    await new Promise((r) => setTimeout(r, 80));

    const successFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    await deliverPendingWebhooks(db, successFetch as unknown as typeof fetch);

    const [delivered] = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId))
      .limit(1);

    const req = new NextRequest(
      `http://test.local/api/v1/webhooks/deliveries/${delivered!.id}/retry`,
      { method: "POST", headers: { [SESSION_USER_HEADER]: userId } },
    );
    const res = await retryDelivery(req, {
      params: Promise.resolve({ deliveryId: delivered!.id }),
    });
    expect(res.status).toBe(409);
  });
});
