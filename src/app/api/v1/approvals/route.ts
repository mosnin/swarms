import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { formatResponse } from "@/lib/format-response";
import { authenticateRequest } from "@/modules/identity/service";
import { listPendingApprovals } from "@/modules/approvals/approval-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw !== null ? Number(limitRaw) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
      throw Errors.validation("limit must be an integer between 1 and 200");
    }
    const approvals = await listPendingApprovals(ctx, { limit });
    if (url.searchParams.get("format") === "markdown") {
      return formatResponse(request, { approvals });
    }
    return ok({ approvals });
  });
}
