import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { cancelSimulation } from "@/modules/simulations/simulation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ simulationRunId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { simulationRunId } = await params;
    const result = await cancelSimulation(ctx, simulationRunId);
    return ok(result);
  });
}
