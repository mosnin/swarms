/**
 * Webhook delivery. Job lifecycle events are written to a durable outbox
 * (`webhook_deliveries`) and delivered out-of-band with HMAC signatures and
 * bounded exponential-backoff retries — at-least-once, never blocking the job.
 */

import { asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { canonicalize } from "@/lib/canonical";
import { signWebhook, webhookSecret } from "@/modules/webhooks/signing";

type Db = ReturnType<typeof getDb>;

export const SIGNATURE_HEADER = "x-swarms-signature";
export const EVENT_HEADER = "x-swarms-event";

export interface WebhookEventInput {
  organizationId: string;
  jobId: string;
  eventType: string;
  url: string;
  data: Record<string, unknown>;
}

/**
 * Build the canonical event body. Keys are sorted recursively so the signed
 * bytes are independent of property order — critical because the payload is
 * persisted as Postgres `jsonb`, which does not preserve key order.
 */
export function buildEventBody(input: WebhookEventInput, occurredAt: string): string {
  return canonicalize({
    type: input.eventType,
    jobId: input.jobId,
    organizationId: input.organizationId,
    occurredAt,
    data: input.data,
  });
}

/** Record a webhook for delivery (does not send synchronously). */
export async function enqueueWebhook(input: WebhookEventInput, db: Db = getDb()): Promise<void> {
  const occurredAt = new Date().toISOString();
  const body = buildEventBody(input, occurredAt);
  const signature = signWebhook(webhookSecret(), body);
  await db.insert(schema.webhookDeliveries).values({
    organizationId: input.organizationId,
    jobId: input.jobId,
    eventType: input.eventType,
    url: input.url,
    payload: JSON.parse(body),
    signature,
    status: "pending",
    nextAttemptAt: new Date(),
  });
}

const BACKOFF_MS = [0, 2_000, 8_000, 30_000, 120_000];

/**
 * Deliver due pending webhooks. POSTs each with its signature; on success marks
 * delivered, on failure backs off, and after `maxAttempts` marks failed.
 * Returns the number attempted.
 *
 * Multi-worker safe: rows are atomically claimed with `FOR UPDATE SKIP LOCKED`
 * before any HTTP call, so concurrent workers never deliver the same webhook.
 */
export async function deliverPendingWebhooks(
  db: Db = getDb(),
  fetchImpl: typeof fetch = fetch,
  batchSize = 20,
): Promise<number> {
  // Atomic claim: flip status to 'delivering' in a single UPDATE ... WHERE id IN
  // (SELECT ... FOR UPDATE SKIP LOCKED). Workers that lose the race see no rows.
  const now = new Date();
  const claimed = await db.execute(sql`
    UPDATE webhook_deliveries
    SET status = 'delivering', updated_at = now()
    WHERE id IN (
      SELECT id FROM webhook_deliveries
      WHERE status = 'pending' AND next_attempt_at <= ${now}
      ORDER BY next_attempt_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  // Normalize across drivers: postgres-js returns an array; pglite returns { rows }.
  const claimedRows = (
    Array.isArray(claimed) ? claimed : (claimed as { rows?: unknown[] }).rows ?? []
  ) as Array<{ id: string }>;
  const claimedIds = new Set(claimedRows.map((r) => r.id));
  if (claimedIds.size === 0) return 0;

  const idList = Array.from(claimedIds);
  const due = await db
    .select()
    .from(schema.webhookDeliveries)
    .where(sql`${schema.webhookDeliveries.id} = ANY(ARRAY[${sql.join(idList.map((id) => sql`${id}`), sql`, `)}]::text[])`)
    .orderBy(asc(schema.webhookDeliveries.nextAttemptAt));

  if (due.length === 0) return 0;

  for (const delivery of due) {
    const body = buildEventBody(
      {
        organizationId: delivery.organizationId,
        jobId: delivery.jobId ?? "",
        eventType: delivery.eventType,
        url: delivery.url,
        data: (delivery.payload as { data?: Record<string, unknown> })?.data ?? {},
      },
      (delivery.payload as { occurredAt?: string })?.occurredAt ?? delivery.createdAt.toISOString(),
    );

    const attempts = delivery.attempts + 1;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetchImpl(delivery.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [SIGNATURE_HEADER]: delivery.signature,
          [EVENT_HEADER]: delivery.eventType,
        },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        await db
          .update(schema.webhookDeliveries)
          .set({ status: "delivered", attempts, deliveredAt: new Date(), lastError: null })
          .where(eq(schema.webhookDeliveries.id, delivery.id));
        continue;
      }
      await scheduleRetry(db, delivery.id, attempts, delivery.maxAttempts, `HTTP ${res.status}`);
    } catch (error) {
      await scheduleRetry(
        db,
        delivery.id,
        attempts,
        delivery.maxAttempts,
        error instanceof Error ? error.message : "delivery error",
      );
    }
  }
  return claimedIds.size;
}

async function scheduleRetry(
  db: Db,
  id: string,
  attempts: number,
  maxAttempts: number,
  lastError: string,
): Promise<void> {
  if (attempts >= maxAttempts) {
    await db
      .update(schema.webhookDeliveries)
      .set({ status: "failed", attempts, lastError })
      .where(eq(schema.webhookDeliveries.id, id));
    logger.warn("Webhook delivery failed permanently", { id, attempts, lastError });
    return;
  }
  const backoff = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 120_000;
  await db
    .update(schema.webhookDeliveries)
    .set({ status: "pending", attempts, lastError, nextAttemptAt: new Date(Date.now() + backoff) })
    .where(eq(schema.webhookDeliveries.id, id));
}
