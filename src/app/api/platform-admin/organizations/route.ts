import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { clientIpFrom } from "@/lib/client-ip";
import { requestIdFrom } from "@/lib/request-id";
import { authenticatePlatformAdmin, enforceAdminRateLimit, logAdminAction } from "@/modules/admin/authz";
import { listOrganizations } from "@/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const admin = await authenticatePlatformAdmin(request);
    await enforceAdminRateLimit(admin);

    const params = new URL(request.url).searchParams;
    const result = await listOrganizations({
      search: params.get("search") ?? undefined,
      page: params.has("page") ? Number(params.get("page")) : undefined,
      pageSize: params.has("pageSize") ? Number(params.get("pageSize")) : undefined,
    });

    await logAdminAction(admin, {
      action: "admin.organizations.list",
      resourceType: "organization",
      requestId: requestIdFrom(request.headers),
      ip: clientIpFrom(request.headers),
      metadata: { search: params.get("search") ?? null, page: result.page },
    });

    return ok(result);
  });
}
