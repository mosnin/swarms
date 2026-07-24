import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { getRunExplanation } from "@/modules/dashboard/reads";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const { jobId } = await params;
    const explanation = await getRunExplanation(ctx, jobId);
    if (!explanation) throw Errors.notFound(`Job ${jobId} not found`);
    return ok({ explanation });
  });
}
