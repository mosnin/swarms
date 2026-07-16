import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { getAgentInstance, terminateAgentInstance } from "@/modules/hosted-agents/agent-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentInstanceId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { agentInstanceId } = await params;
    const result = await getAgentInstance(ctx, agentInstanceId);
    return ok(result);
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentInstanceId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const { agentInstanceId } = await params;
    await terminateAgentInstance(ctx, agentInstanceId);
    return ok({ agentInstanceId, status: "terminated" });
  });
}
