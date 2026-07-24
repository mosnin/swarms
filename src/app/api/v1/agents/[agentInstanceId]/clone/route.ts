import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { cloneAgentInstance } from "@/modules/hosted-agents/agent-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ name: z.string().min(1).max(120).optional() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentInstanceId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const { agentInstanceId } = await params;

    // Body is optional — an empty POST clones with a "(copy)" name.
    const json = await readJsonBody(request).catch(() => ({}));
    const parsed = body.safeParse(json ?? {});
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const agent = await cloneAgentInstance(ctx, agentInstanceId, { name: parsed.data.name });
    return ok({ agent }, 201);
  });
}
