import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { formatResponse } from "@/lib/format-response";
import { authenticateRequest } from "@/modules/identity/service";
import { getArtifact } from "@/modules/artifacts/artifact-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { artifactId } = await params;
    const artifact = await getArtifact(ctx, artifactId);
    if (new URL(request.url).searchParams.get("format") === "markdown") {
      return formatResponse(request, { artifact });
    }
    return ok({ artifact });
  });
}
