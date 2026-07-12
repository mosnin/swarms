import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { formatResponse } from "@/lib/format-response";
import { authenticateRequest } from "@/modules/identity/service";
import { getBalances } from "@/modules/billing/credit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const balances = await getBalances(ctx);
    if (new URL(request.url).searchParams.get("format") === "markdown") {
      return formatResponse(request, { balances });
    }
    return ok({ balances });
  });
}
