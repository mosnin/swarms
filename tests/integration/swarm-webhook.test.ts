/**
 * Integration tests for swarm webhook delivery.
 *
 * When a swarm is spawned with callbackUrl, a signed webhook is enqueued
 * in webhook_deliveries and delivered by deliverPendingWebhooks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { spawnSwarm } from "@/modules/swarms/spawn-swarm";
import { deliverPendingWebhooks, EVENT_HEADER, SIGNATURE_HEADER } from "@/modules/webhooks/webhook-service";
import { verifyWebhook, webhookSecret } from "@/modules/webhooks/signing";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: swarm webhook delivery", () => {
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

  it("enqueues a swarm.succeeded webhook when a swarm completes successfully", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm-wh-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const result = await spawnSwarm(
      ctx,
      {
        tasks: ["task A", "task B"],
        budgetMinor: 200,
        idempotencyKey: "swarm-wh-1",
        callbackUrl: "https://hooks.example.com/swarm",
      },
      db,
    );

    expect(result.status).toBe("succeeded");

    // Give the best-effort enqueue time to complete (it's fire-and-forget via .catch).
    await new Promise((r) => setTimeout(r, 50));

    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));

    expect(deliveries).toHaveLength(1);
    const delivery = deliveries[0]!;
    expect(delivery.eventType).toBe("swarm.succeeded");
    expect(delivery.status).toBe("pending");
    expect(delivery.url).toBe("https://hooks.example.com/swarm");
    expect(delivery.jobId).toBeNull(); // swarm webhooks have no jobId

    // Payload is the full canonical event body. swarmRunId is top-level;
    // status lives inside the nested data object.
    const payload = delivery.payload as { swarmRunId: string; data: { status: string } };
    expect(payload.swarmRunId).toBe(result.swarmRunId);
    expect(payload.data.status).toBe("succeeded");
  });

  it("delivers the webhook with a valid HMAC signature", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm-wh-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await spawnSwarm(
      ctx,
      {
        tasks: ["task A"],
        budgetMinor: 100,
        idempotencyKey: "swarm-wh-2",
        callbackUrl: "https://hooks.example.com/verify",
      },
      db,
    );

    await new Promise((r) => setTimeout(r, 50));

    // Deliver with a mock fetch that captures headers + body.
    let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = {
        url: String(url),
        headers: init?.headers as Record<string, string>,
        body: String(init?.body),
      };
      return new Response("ok", { status: 200 });
    });

    const delivered = await deliverPendingWebhooks(db, fetchMock as unknown as typeof fetch);
    expect(delivered).toBe(1);

    expect(captured!.url).toBe("https://hooks.example.com/verify");
    expect(captured!.headers[EVENT_HEADER]).toBe("swarm.succeeded");

    // Signature must verify against the exact body that was sent.
    const sig = captured!.headers[SIGNATURE_HEADER]!;
    expect(verifyWebhook(webhookSecret(), captured!.body, sig)).toBe(true);

    // Body should include swarmRunId at the top level.
    const body = JSON.parse(captured!.body) as { swarmRunId: string; type: string };
    expect(body.type).toBe("swarm.succeeded");
    expect(typeof body.swarmRunId).toBe("string");

    // Delivery row marked as delivered.
    const rows = await db
      .select({ status: schema.webhookDeliveries.status })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    expect(rows[0]?.status).toBe("delivered");
  });

  it("does NOT enqueue a webhook when callbackUrl is omitted", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm-wh-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await spawnSwarm(
      ctx,
      { tasks: ["task A"], budgetMinor: 100, idempotencyKey: "swarm-wh-3" },
      db,
    );

    await new Promise((r) => setTimeout(r, 50));

    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    expect(deliveries).toHaveLength(0);
  });

  it("retries on a non-2xx response and keeps status pending", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-swarm-wh-4");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await spawnSwarm(
      ctx,
      {
        tasks: ["task A"],
        budgetMinor: 100,
        idempotencyKey: "swarm-wh-4",
        callbackUrl: "https://hooks.example.com/bad",
      },
      db,
    );

    await new Promise((r) => setTimeout(r, 50));

    const failing = vi.fn(async () => new Response("error", { status: 503 }));
    await deliverPendingWebhooks(db, failing as unknown as typeof fetch);

    const rows = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.organizationId, organizationId));
    expect(rows[0]?.status).toBe("pending"); // still pending, will retry
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.lastError).toContain("503");
  });
});
