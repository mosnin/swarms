import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { callConnectorTool } from "@/modules/connectors/connector-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  connectorSlug: z.string().min(1),
  toolName: z.string().min(1),
  input: z.unknown(),
  grantedScopes: z.array(z.string()).default([]),
  jobId: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "connectorCall");
    const json = await request.json().catch(() => null);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const result = await callConnectorTool(ctx, {
      connectorSlug: parsed.data.connectorSlug,
      toolName: parsed.data.toolName,
      input: parsed.data.input,
      grantedScopes: parsed.data.grantedScopes,
      jobId: parsed.data.jobId,
    });
    return ok(result);
  });
}
