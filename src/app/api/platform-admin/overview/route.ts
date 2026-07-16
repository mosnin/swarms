import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { clientIpFrom } from "@/lib/client-ip";
import { requestIdFrom } from "@/lib/request-id";
import { authenticatePlatformAdmin, enforceAdminRateLimit, logAdminAction } from "@/modules/admin/authz";
import { getPlatformOverview } from "@/modules/admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const admin = await authenticatePlatformAdmin(request);
    await enforceAdminRateLimit(admin);
    const overview = await getPlatformOverview();
    await logAdminAction(admin, {
      action: "admin.overview.read",
      resourceType: "platform",
      requestId: requestIdFrom(request.headers),
      ip: clientIpFrom(request.headers),
    });
    return ok({ overview });
  });
}
