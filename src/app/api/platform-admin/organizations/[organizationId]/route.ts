import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { clientIpFrom } from "@/lib/client-ip";
import { Errors } from "@/lib/errors";
import { requestIdFrom } from "@/lib/request-id";
import { authenticatePlatformAdmin, enforceAdminRateLimit, logAdminAction } from "@/modules/admin/authz";
import { getOrganizationDetail } from "@/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  return route(async () => {
    const admin = await authenticatePlatformAdmin(request);
    await enforceAdminRateLimit(admin);

    const { organizationId } = await params;
    const detail = await getOrganizationDetail(organizationId);
    if (!detail) throw Errors.notFound("Organization not found");

    await logAdminAction(admin, {
      action: "admin.organization.read",
      resourceType: "organization",
      resourceId: organizationId,
      targetOrganizationId: organizationId,
      requestId: requestIdFrom(request.headers),
      ip: clientIpFrom(request.headers),
    });

    return ok({ organization: detail });
  });
}
