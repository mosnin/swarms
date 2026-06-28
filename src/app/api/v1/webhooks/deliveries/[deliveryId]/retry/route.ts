/**
 * POST /api/v1/webhooks/deliveries/:deliveryId/retry
 *
 * Reset a failed or pending webhook delivery so it will be picked up by the
 * next `deliverPendingWebhooks` run. Idempotent: re-queueing an already-pending
 * delivery is a no-op (returns the current row unchanged).
 *
 * Only deliveries in "failed" or "pending" status can be retried. Deliveries
 * that are currently "delivering" or already "delivered" are rejected with 409.
 */

import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { ok, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { requirePermission } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deliveryId: string }> },
): Promise<Response> {
  return route(async () => {
    const db = getDb();
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    requirePermission(ctx, "org.manage");

    const { deliveryId } = await params;
    const delivery = (
      await db
        .select()
        .from(schema.webhookDeliveries)
        .where(
          and(
            eq(schema.webhookDeliveries.id, deliveryId),
            eq(schema.webhookDeliveries.organizationId, ctx.organizationId),
          ),
        )
        .limit(1)
    )[0];

    if (!delivery) throw Errors.notFound(`Delivery ${deliveryId} not found`);

    if (delivery.status === "delivered") {
      throw Errors.conflict("Delivery already succeeded — retry not needed");
    }
    if (delivery.status === "delivering") {
      throw Errors.conflict("Delivery is currently in progress");
    }

    // Reset to pending with immediate next attempt, preserving attempt count so
    // it still eventually exhausts maxAttempts.
    if (delivery.status === "pending") {
      return ok({
        delivery: { id: delivery.id, status: delivery.status, message: "Already pending" },
      });
    }

    const [updated] = await db
      .update(schema.webhookDeliveries)
      .set({ status: "pending", nextAttemptAt: new Date(), lastError: null })
      .where(eq(schema.webhookDeliveries.id, deliveryId))
      .returning();

    return ok({
      delivery: {
        id: updated?.id ?? deliveryId,
        status: updated?.status ?? "pending",
        attempts: updated?.attempts ?? delivery.attempts,
      },
    });
  });
}
