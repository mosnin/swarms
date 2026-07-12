import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { formatResponse } from "@/lib/format-response";
import { authenticateRequest } from "@/modules/identity/service";
import { getEvaluation } from "@/modules/evaluations/evaluation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ evaluationId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { evaluationId } = await params;
    const evaluation = await getEvaluation(ctx, evaluationId);
    if (new URL(request.url).searchParams.get("format") === "markdown") {
      return formatResponse(request, { evaluation });
    }
    return ok({ evaluation });
  });
}
