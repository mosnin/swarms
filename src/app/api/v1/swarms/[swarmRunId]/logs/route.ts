import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { getSwarmLogs } from "@/modules/swarms/swarm-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ swarmRunId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { swarmRunId } = await params;
    const logs = await getSwarmLogs(ctx, swarmRunId);
    return ok({ logs });
  });
}
