/**
 * DELETE /api/v1/webhooks/:endpointId — remove a registered webhook endpoint
 */

import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { deleteWebhookEndpoint } from "@/modules/webhooks/endpoint-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ endpointId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { endpointId } = await params;
    await deleteWebhookEndpoint(ctx, endpointId);
    return ok({ deleted: true });
  });
}
