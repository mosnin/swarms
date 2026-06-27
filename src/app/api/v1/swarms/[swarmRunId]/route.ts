import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { formatResponse } from "@/lib/format-response";
import { authenticateRequest } from "@/modules/identity/service";
import { getSwarmRun } from "@/modules/swarms/swarm-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ swarmRunId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { swarmRunId } = await params;
    const run = await getSwarmRun(ctx, swarmRunId);
    const url = new URL(request.url);
    if (url.searchParams.get("format") === "markdown") {
      return formatResponse(request, { run });
    }
    return ok({ run });
  });
}
