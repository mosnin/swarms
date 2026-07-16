import type { NextRequest } from "next/server";

import { ok, readJsonBody, route } from "@/lib/api";
import { clientIpFrom } from "@/lib/client-ip";
import { requestIdFrom } from "@/lib/request-id";
import { authenticatePlatformAdmin, enforceAdminRateLimit, logAdminAction } from "@/modules/admin/authz";
import { assertBreakGlassReason, revokeApiKeyAsAdmin } from "@/modules/admin/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
): Promise<Response> {
  return route(async () => {
    const admin = await authenticatePlatformAdmin(request);
    await enforceAdminRateLimit(admin);

    const { keyId } = await params;
    const body = (await readJsonBody(request)) as { reason?: unknown } | null;
    const reason = assertBreakGlassReason(body?.reason);

    const { organizationId } = await revokeApiKeyAsAdmin(keyId);
    await logAdminAction(admin, {
      action: "admin.api_key.revoke",
      resourceType: "api_key",
      resourceId: keyId,
      targetOrganizationId: organizationId,
      reason,
      requestId: requestIdFrom(request.headers),
      ip: clientIpFrom(request.headers),
    });

    return ok({ keyId, revoked: true });
  });
}
