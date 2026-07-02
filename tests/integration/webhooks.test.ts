import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { processJobInDb } from "@/modules/execution/worker";
import {
  deliverPendingWebhooks,
  EVENT_HEADER,
  SIGNATURE_HEADER,
} from "@/modules/webhooks/webhook-service";
import { verifyWebhook, webhookSecret } from "@/modules/webhooks/signing";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, enqueueAgentJob, seedOrg, type TestDb } from "./harness";

describe("integration: webhook delivery", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("enqueues a signed job.succeeded webhook and delivers it", async () => {
    const { organizationId, userId } = await seedOrg(db);

    const res = await enqueueAgentJob(db, {
      organizationId,
      userId,
      idempotencyKey: "wh-key-0001",
      callbackUrl: "https://hook.test/endpoint",
    });
    await processJobInDb(res.jobId, db);

    // A pending delivery exists.
    const pending = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.jobId, res.jobId));
    expect(pending).toHaveLength(1);
    expect(pending[0]?.eventType).toBe("job.succeeded");
    expect(pending[0]?.status).toBe("pending");

    // Deliver with a mock fetch that captures the request.
    let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = {
        url: String(url),
        headers: init?.headers as Record<string, string>,
        body: String(init?.body),
      };
      return new Response("ok", { status: 200 });
    });

    const count = await deliverPendingWebhooks(db, fetchMock as unknown as typeof fetch);
    expect(count).toBe(1);

    // Signature header verifies against the delivered body.
    expect(captured!.url).toBe("https://hook.test/endpoint");
    expect(captured!.headers[EVENT_HEADER]).toBe("job.succeeded");
    const sig = captured!.headers[SIGNATURE_HEADER]!;
    expect(verifyWebhook(webhookSecret(), captured!.body, sig)).toBe(true);

    // Marked delivered.
    const after = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.jobId, res.jobId));
    expect(after[0]?.status).toBe("delivered");
  });

  it("retries (backs off) on a failing endpoint", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-wh2");

    const res = await enqueueAgentJob(db, {
      organizationId,
      userId,
      idempotencyKey: "wh-key-0002",
      callbackUrl: "https://hook.test/bad",
    });
    await processJobInDb(res.jobId, db);

    const failing = vi.fn(async () => new Response("nope", { status: 500 }));
    await deliverPendingWebhooks(db, failing as unknown as typeof fetch);

    const row = (
      await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.jobId, res.jobId))
    )[0]!;
    expect(row.attempts).toBe(1);
    expect(row.status).toBe("pending"); // still retrying
    expect(row.lastError).toContain("500");
  });
});
