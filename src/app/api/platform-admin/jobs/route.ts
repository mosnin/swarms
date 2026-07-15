import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { clientIpFrom } from "@/lib/client-ip";
import { requestIdFrom } from "@/lib/request-id";
import { authenticatePlatformAdmin, enforceAdminRateLimit, logAdminAction } from "@/modules/admin/authz";
import { listJobsAcrossOrganizations } from "@/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const admin = await authenticatePlatformAdmin(request);
    await enforceAdminRateLimit(admin);

    const params = new URL(request.url).searchParams;
    const result = await listJobsAcrossOrganizations({
      status: params.get("status") ?? undefined,
      organizationId: params.get("organizationId") ?? undefined,
      page: params.has("page") ? Number(params.get("page")) : undefined,
      pageSize: params.has("pageSize") ? Number(params.get("pageSize")) : undefined,
    });

    await logAdminAction(admin, {
      action: "admin.jobs.list",
      resourceType: "job",
      targetOrganizationId: params.get("organizationId") ?? null,
      requestId: requestIdFrom(request.headers),
      ip: clientIpFrom(request.headers),
      metadata: { status: params.get("status") ?? null, page: result.page },
    });

    return ok(result);
  });
}
