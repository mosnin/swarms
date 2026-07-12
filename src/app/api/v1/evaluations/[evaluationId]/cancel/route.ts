import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { cancelEvaluation } from "@/modules/evaluations/evaluation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ evaluationId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { evaluationId } = await params;
    const result = await cancelEvaluation(ctx, evaluationId);
    return ok(result);
  });
}
