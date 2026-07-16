import type { NextRequest } from "next/server";

import { ok, readJsonBody, route } from "@/lib/api";
import { clientIpFrom } from "@/lib/client-ip";
import { getDb } from "@/lib/db";
import { requestIdFrom } from "@/lib/request-id";
import { authenticatePlatformAdmin, enforceAdminRateLimit, logAdminAction } from "@/modules/admin/authz";
import { assertBreakGlassReason, suspendOrganization } from "@/modules/admin/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  return route(async () => {
    const admin = await authenticatePlatformAdmin(request);
    await enforceAdminRateLimit(admin);

    const { organizationId } = await params;
    const body = (await readJsonBody(request)) as { reason?: unknown } | null;
    const reason = assertBreakGlassReason(body?.reason);

    // Mutation + audit row commit together: a suspension can never exist
    // without its audit entry (and vice versa).
    await getDb().transaction(async (tx) => {
      await suspendOrganization(organizationId, tx);
      await logAdminAction(
        admin,
        {
          action: "admin.organization.suspend",
          resourceType: "organization",
          resourceId: organizationId,
          targetOrganizationId: organizationId,
          reason,
          requestId: requestIdFrom(request.headers),
          ip: clientIpFrom(request.headers),
        },
        tx,
      );
    });

    return ok({ organizationId, status: "suspended" });
  });
}
