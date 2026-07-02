/**
 * DELETE /api/v1/keys/:keyId — revoke an API key
 *
 * Idempotent: revoking an already-revoked key returns 200 with the key's
 * current state. Returns 404 when the key is not found in the caller's org.
 */

import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest, revokeApiKey } from "@/modules/identity/service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const { keyId } = await params;
    const key = await revokeApiKey(ctx, keyId);
    return ok({ key });
  });
}
