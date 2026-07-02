/**
 * GET /api/v1/webhooks/deliveries
 *
 * List webhook delivery attempts for the caller's org. Supports filtering by
 * status and eventType, and cursor-based pagination (newest first).
 *
 * Query params:
 *   status     — pending | delivering | delivered | failed
 *   eventType  — e.g. "swarm.succeeded", "budget.warning"
 *   limit      — 1–100 (default 20)
 *   cursor     — opaque nextCursor from a prior response
 */

import type { NextRequest } from "next/server";
import { and, desc, eq, lt, type SQL } from "drizzle-orm";

import { ok, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { requirePermission } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["pending", "delivering", "delivered", "failed"]);

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const db = getDb();
    const ctx = await authenticateRequest(request);
    requirePermission(ctx, "org.read");

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const eventType = url.searchParams.get("eventType") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor") ?? undefined;

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      throw Errors.validation(
        `Invalid status: "${status}". Must be one of: ${[...VALID_STATUSES].join(", ")}`,
      );
    }
    const limit = limitRaw !== null ? Number(limitRaw) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw Errors.validation("limit must be an integer between 1 and 100");
    }

    const conds: SQL[] = [eq(schema.webhookDeliveries.organizationId, ctx.organizationId)];
    if (status) conds.push(eq(schema.webhookDeliveries.status, status));
    if (eventType) conds.push(eq(schema.webhookDeliveries.eventType, eventType));

    if (cursor) {
      const cursorRow = (
        await db
          .select({ createdAt: schema.webhookDeliveries.createdAt })
          .from(schema.webhookDeliveries)
          .where(
            and(
              eq(schema.webhookDeliveries.id, cursor),
              eq(schema.webhookDeliveries.organizationId, ctx.organizationId),
            ),
          )
          .limit(1)
      )[0];
      if (!cursorRow) throw Errors.validation("Invalid cursor");
      conds.push(lt(schema.webhookDeliveries.createdAt, cursorRow.createdAt));
    }

    const rows = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(and(...conds))
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(limit + 1);

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? (page[page.length - 1]?.id ?? null) : null;

    return ok({
      deliveries: page.map((d) => ({
        id: d.id,
        eventType: d.eventType,
        url: d.url,
        status: d.status,
        attempts: d.attempts,
        maxAttempts: d.maxAttempts,
        lastError: d.lastError ?? null,
        nextAttemptAt: d.nextAttemptAt.toISOString(),
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
      nextCursor,
    });
  });
}
