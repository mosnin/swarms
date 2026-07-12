import type { NextRequest } from "next/server";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { assertSafeUrl } from "@/lib/ssrf-guard";
import { formatResponse } from "@/lib/format-response";
import { requireOrganization } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";
import { evaluationConfigSchema } from "@/modules/evaluations/schema";
import { enqueueEvaluation, listEvaluations } from "@/modules/evaluations/evaluation-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw !== null ? Number(limitRaw) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
      throw Errors.validation("limit must be an integer between 1 and 200");
    }
    const evaluations = await listEvaluations(ctx, { limit });
    if (url.searchParams.get("format") === "markdown") {
      return formatResponse(request, { evaluations });
    }
    return ok({ evaluations });
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const json = await readJsonBody(request);
    const parsed = evaluationConfigSchema.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    if (parsed.data.organizationId) requireOrganization(ctx, parsed.data.organizationId);
    if (parsed.data.callbackUrl !== undefined) await assertSafeUrl(parsed.data.callbackUrl, "callbackUrl");
    const evaluation = await enqueueEvaluation(ctx, parsed.data);
    return ok(evaluation, 202);
  });
}
