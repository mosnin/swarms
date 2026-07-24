import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { listAgentMessages, postAgentMessage } from "@/modules/hosted-agents/agent-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ content: z.string().min(1).max(8_000) });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentInstanceId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const { agentInstanceId } = await params;

    const url = request.nextUrl;
    const limitParam = url.searchParams.get("limit");
    const parsedLimit = limitParam === null ? undefined : Number(limitParam);
    if (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit < 1)) {
      throw Errors.validation("limit must be a positive integer");
    }

    const page = await listAgentMessages(ctx, agentInstanceId, {
      limit: parsedLimit,
      cursor: url.searchParams.get("cursor"),
    });
    return ok(page);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentInstanceId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const { agentInstanceId } = await params;
    const json = await readJsonBody(request);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const message = await postAgentMessage(ctx, agentInstanceId, parsed.data.content);
    return ok({ message }, 202);
  });
}
