/**
 * POST /api/v1/keys/:keyId/rotate — rotate an API key's secret in place.
 *
 * The key keeps its id, name, scopes, and any scoped budget; the old secret
 * stops working immediately. The new plaintext is returned exactly once and
 * never stored.
 */

import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest, rotateApiKey } from "@/modules/identity/service";
import { writeAudit } from "@/modules/governance/audit";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const { keyId } = await params;
    const result = await rotateApiKey(ctx, keyId);
    await writeAudit(ctx, { action: "api_key.rotated", resourceType: "api_key", resourceId: keyId });
    return ok(result);
  });
}
