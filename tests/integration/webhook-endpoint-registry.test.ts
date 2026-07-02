/**
 * Integration tests for org-level webhook endpoint registration (#16).
 *
 * Registered endpoints receive swarm lifecycle and budget alert events
 * for the org automatically — no per-request callbackUrl needed.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  enabledEndpointUrls,
  listWebhookEndpoints,
} from "@/modules/webhooks/endpoint-service";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { GET, POST } from "@/app/api/v1/webhooks/route";
import { DELETE } from "@/app/api/v1/webhooks/[endpointId]/route";

describe("integration: webhook endpoint registry", () => {
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

  // --- service-layer tests ---

  it("creates and lists endpoints", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-ep-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const ep = await createWebhookEndpoint(
      ctx,
      { url: "https://example.com/hook", description: "prod hook" },
      db,
    );
    expect(ep.id).toMatch(/^whe_/);
    expect(ep.url).toBe("https://example.com/hook");
    expect(ep.description).toBe("prod hook");
    expect(ep.enabled).toBe(true);

    const list = await listWebhookEndpoints(ctx, db);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(ep.id);
  });

  it("deletes an endpoint", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-ep-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const ep = await createWebhookEndpoint(ctx, { url: "https://example.com/a" }, db);
    await deleteWebhookEndpoint(ctx, ep.id, db);
    const list = await listWebhookEndpoints(ctx, db);
    expect(list).toHaveLength(0);
  });

  it("returns 404 when deleting an endpoint from another org", async () => {
    const { organizationId: org1Id, userId: user1Id } = await seedOrg(db, "org-ep-3a");
    const { organizationId: org2Id, userId: user2Id } = await seedOrg(db, "org-ep-3b");
    const ctx1 = userContext({ organizationId: org1Id, userId: user1Id, membershipId: "m", role: "owner" });
    const ctx2 = userContext({ organizationId: org2Id, userId: user2Id, membershipId: "m", role: "owner" });

    const ep = await createWebhookEndpoint(ctx1, { url: "https://example.com/a" }, db);
    await expect(deleteWebhookEndpoint(ctx2, ep.id, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("enabledEndpointUrls returns only enabled URLs for the org", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-ep-4");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await createWebhookEndpoint(ctx, { url: "https://a.example.com" }, db);
    await createWebhookEndpoint(ctx, { url: "https://b.example.com" }, db);
    // Manually disable one.
    const list = await listWebhookEndpoints(ctx, db);
    await db
      .update(schema.webhookEndpoints)
      .set({ enabled: false })
      .where(eq(schema.webhookEndpoints.id, list[0]!.id));

    const urls = await enabledEndpointUrls(organizationId, db);
    expect(urls).toHaveLength(1);
  });

  // --- HTTP route tests ---

  it("POST /api/v1/webhooks creates an endpoint (201)", async () => {
    const { userId } = await seedOrg(db, "org-ep-5");
    const req = new NextRequest("http://test.local/api/v1/webhooks", {
      method: "POST",
      headers: { [SESSION_USER_HEADER]: userId, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://hooks.example.com/ep5" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { endpoint: { id: string; url: string } } };
    expect(body.data.endpoint.url).toBe("https://hooks.example.com/ep5");
  });

  it("GET /api/v1/webhooks lists endpoints", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-ep-6");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    await createWebhookEndpoint(ctx, { url: "https://a.example.com" }, db);
    await createWebhookEndpoint(ctx, { url: "https://b.example.com" }, db);

    const req = new NextRequest("http://test.local/api/v1/webhooks", {
      headers: { [SESSION_USER_HEADER]: userId },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { endpoints: unknown[] } };
    expect(body.data.endpoints).toHaveLength(2);
  });

  it("DELETE /api/v1/webhooks/:id removes the endpoint", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-ep-7");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const ep = await createWebhookEndpoint(ctx, { url: "https://example.com/del" }, db);

    const req = new NextRequest(`http://test.local/api/v1/webhooks/${ep.id}`, {
      method: "DELETE",
      headers: { [SESSION_USER_HEADER]: userId },
    });
    const res = await DELETE(req, { params: Promise.resolve({ endpointId: ep.id }) });
    expect(res.status).toBe(200);

    const list = await listWebhookEndpoints(ctx, db);
    expect(list).toHaveLength(0);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const res = await GET(new NextRequest("http://test.local/api/v1/webhooks"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid POST body", async () => {
    const { userId } = await seedOrg(db, "org-ep-8");
    const req = new NextRequest("http://test.local/api/v1/webhooks", {
      method: "POST",
      headers: { [SESSION_USER_HEADER]: userId, "content-type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // --- fan-out integration test ---

  it("swarm lifecycle events fan out to registered endpoints even without callbackUrl", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-ep-9");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // Register two org-level endpoints.
    await createWebhookEndpoint(ctx, { url: "https://endpoint1.example.com/hook" }, db);
    await createWebhookEndpoint(ctx, { url: "https://endpoint2.example.com/hook" }, db);

    // Spawn without per-request callbackUrl.
    await spawnSwarm(
      ctx,
      { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "ep-fanout-1" },
      db,
    );

    // Wait for fire-and-forget fan-out.
    await new Promise((r) => setTimeout(r, 100));

    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));

    // One swarm.succeeded delivery per registered endpoint.
    const swarmEvents = deliveries.filter((d) => d.eventType === "swarm.succeeded");
    expect(swarmEvents).toHaveLength(2);
    const urls = swarmEvents.map((d) => d.url).sort();
    expect(urls).toEqual([
      "https://endpoint1.example.com/hook",
      "https://endpoint2.example.com/hook",
    ]);
  });

  it("fan-out combines per-request callbackUrl with registered endpoints (deduped)", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-ep-10");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    // Register one org endpoint — same URL as the per-request callbackUrl.
    await createWebhookEndpoint(ctx, { url: "https://shared.example.com/hook" }, db);

    await spawnSwarm(
      ctx,
      {
        tasks: ["task A"],
        budgetMinor: 100,
        idempotencyKey: "ep-fanout-dedup-1",
        callbackUrl: "https://shared.example.com/hook", // same as registered
      },
      db,
    );
    await new Promise((r) => setTimeout(r, 100));

    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));

    // Deduplication by Set means only one delivery to the shared URL.
    const swarmEvents = deliveries.filter((d) => d.eventType === "swarm.succeeded");
    expect(swarmEvents).toHaveLength(1);
    expect(swarmEvents[0]?.url).toBe("https://shared.example.com/hook");
  });
});
