import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { formatResponse } from "@/lib/format-response";
import { authenticateRequest } from "@/modules/identity/service";
import { listArtifacts, uploadArtifact } from "@/modules/artifacts/artifact-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  filename: z.string().min(1).max(512),
  contentType: z.string().max(128).optional(),
  /** Base64-encoded file bytes. */
  contentBase64: z.string().min(1),
  jobId: z.string().optional(),
  swarmRunId: z.string().optional(),
  simulationRunId: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw !== null ? Number(limitRaw) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
      throw Errors.validation("limit must be an integer between 1 and 200");
    }
    const artifacts = await listArtifacts(ctx, { jobId, limit });
    if (url.searchParams.get("format") === "markdown") {
      return formatResponse(request, { artifacts });
    }
    return ok({ artifacts });
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const json = await readJsonBody(request);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(parsed.data.contentBase64, "base64");
    } catch {
      throw Errors.validation("contentBase64 is not valid base64");
    }
    const artifact = await uploadArtifact(ctx, {
      bytes,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      jobId: parsed.data.jobId ?? null,
      swarmRunId: parsed.data.swarmRunId ?? null,
      simulationRunId: parsed.data.simulationRunId ?? null,
    });
    return ok({ artifact }, 201);
  });
}
