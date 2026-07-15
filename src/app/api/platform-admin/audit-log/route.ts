import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { clientIpFrom } from "@/lib/client-ip";
import { requestIdFrom } from "@/lib/request-id";
import { authenticatePlatformAdmin, enforceAdminRateLimit, logAdminAction } from "@/modules/admin/authz";
import { listAdminAuditLog } from "@/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const admin = await authenticatePlatformAdmin(request);
    await enforceAdminRateLimit(admin);

    const params = new URL(request.url).searchParams;
    const result = await listAdminAuditLog({
      actorUserId: params.get("actorUserId") ?? undefined,
      targetOrganizationId: params.get("organizationId") ?? undefined,
      page: params.has("page") ? Number(params.get("page")) : undefined,
      pageSize: params.has("pageSize") ? Number(params.get("pageSize")) : undefined,
    });

    await logAdminAction(admin, {
      action: "admin.audit_log.read",
      resourceType: "admin_audit_log",
      requestId: requestIdFrom(request.headers),
      ip: clientIpFrom(request.headers),
    });

    return ok(result);
  });
}
