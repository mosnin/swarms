import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { formatResponse } from "@/lib/format-response";
import { authenticateRequest } from "@/modules/identity/service";
import { getUsageAnalytics } from "@/modules/billing/credit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const url = new URL(request.url);
    const sinceRaw = url.searchParams.get("sinceDays");
    const sinceDays = sinceRaw !== null ? Number(sinceRaw) : undefined;
    if (sinceDays !== undefined && (!Number.isInteger(sinceDays) || sinceDays < 1 || sinceDays > 365)) {
      throw Errors.validation("sinceDays must be an integer between 1 and 365");
    }
    const currency = url.searchParams.get("currency") ?? undefined;
    const usage = await getUsageAnalytics(ctx, { sinceDays, currency });
    if (url.searchParams.get("format") === "markdown") {
      return formatResponse(request, { usage });
    }
    return ok({ usage });
  });
}
