import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { clientIpFrom } from "@/lib/client-ip";
import { requestIdFrom } from "@/lib/request-id";
import { authenticatePlatformAdmin, enforceAdminRateLimit, logAdminAction } from "@/modules/admin/authz";
import { getPlatformTimeseries } from "@/modules/admin/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const admin = await authenticatePlatformAdmin(request);
    await enforceAdminRateLimit(admin);

    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? Number(daysParam) : undefined;
    const timeseries = await getPlatformTimeseries({ days });

    await logAdminAction(admin, {
      action: "admin.metrics.read",
      resourceType: "platform",
      requestId: requestIdFrom(request.headers),
      ip: clientIpFrom(request.headers),
    });
    return ok({ timeseries });
  });
}
