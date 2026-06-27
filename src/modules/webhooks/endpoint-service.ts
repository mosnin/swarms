/**
 * Org-level webhook endpoint registry. Endpoints persist across requests so
 * swarm lifecycle and budget events are always delivered — no per-request
 * callbackUrl required.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { Errors } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";

type Db = ReturnType<typeof getDb>;

export interface WebhookEndpointView {
  id: string;
  url: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
}

function toView(row: typeof schema.webhookEndpoints.$inferSelect): WebhookEndpointView {
  return {
    id: row.id,
    url: row.url,
    description: row.description ?? null,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listWebhookEndpoints(
  ctx: AuthContext,
  db: Db = getDb(),
): Promise<WebhookEndpointView[]> {
  requirePermission(ctx, "org.read");
  const rows = await db
    .select()
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.organizationId, ctx.organizationId));
  return rows.map(toView);
}

export async function createWebhookEndpoint(
  ctx: AuthContext,
  input: { url: string; description?: string },
  db: Db = getDb(),
): Promise<WebhookEndpointView> {
  requirePermission(ctx, "org.manage");
  const [row] = await db
    .insert(schema.webhookEndpoints)
    .values({
      organizationId: ctx.organizationId,
      url: input.url,
      description: input.description ?? null,
      enabled: true,
    })
    .returning();
  if (!row) throw Errors.internal("Failed to create webhook endpoint");
  return toView(row);
}

export async function deleteWebhookEndpoint(
  ctx: AuthContext,
  endpointId: string,
  db: Db = getDb(),
): Promise<void> {
  requirePermission(ctx, "org.manage");
  const existing = (
    await db
      .select({ organizationId: schema.webhookEndpoints.organizationId })
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, endpointId))
      .limit(1)
  )[0];
  if (!existing || existing.organizationId !== ctx.organizationId) {
    throw Errors.notFound(`Webhook endpoint ${endpointId} not found`);
  }
  await db
    .delete(schema.webhookEndpoints)
    .where(
      and(
        eq(schema.webhookEndpoints.id, endpointId),
        eq(schema.webhookEndpoints.organizationId, ctx.organizationId),
      ),
    );
}

/** Return all enabled endpoint URLs registered for an org. */
export async function enabledEndpointUrls(
  organizationId: string,
  db: Db = getDb(),
): Promise<string[]> {
  const rows = await db
    .select({ url: schema.webhookEndpoints.url })
    .from(schema.webhookEndpoints)
    .where(
      and(
        eq(schema.webhookEndpoints.organizationId, organizationId),
        eq(schema.webhookEndpoints.enabled, true),
      ),
    );
  return rows.map((r) => r.url);
}
