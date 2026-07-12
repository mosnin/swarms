/**
 * GET /api/v1/simulations/frameworks
 *
 * The standardized simulation framework catalog — reusable persona packs +
 * scenarios an MCP agent can start from. No auth required (like the API root):
 * it is a static, public discovery document. Heavily cached.
 */

import type { NextRequest } from "next/server";

import { formatResponse } from "@/lib/format-response";
import { frameworkSummary, listFrameworks } from "@/server/simulations/frameworks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Response {
  const body = { frameworks: listFrameworks().map(frameworkSummary) };
  const cacheHeaders = { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };

  if (new URL(request.url).searchParams.get("format") === "markdown") {
    return formatResponse(request, body, { headers: cacheHeaders });
  }
  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cacheHeaders },
  });
}
