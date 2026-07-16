import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { setAgentInstanceStatus } from "@/modules/hosted-agents/agent-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentInstanceId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const { agentInstanceId } = await params;
    const agent = await setAgentInstanceStatus(ctx, agentInstanceId, "paused");
    return ok({ agent });
  });
}
