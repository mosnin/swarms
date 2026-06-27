/**
 * GET /api/v1
 *
 * Public API root — no authentication required. Returns a self-describing
 * document that agents can use to discover endpoints, skill catalog URLs, and
 * the current API version. Treat this as a stable entry point: an agent that
 * knows nothing except the base URL can GET /api/v1 and navigate from there.
 *
 * Response is intentionally lightweight (<1 KB) and heavily cached so agents
 * can re-fetch it on every cold start without burning quota.
 */

import type { NextRequest } from "next/server";
import { formatResponse } from "@/lib/format-response";
import { CATALOG_VERSION } from "@/server/skills/skill-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Response {
  const body = {
    api: "swarms",
    version: "v1",
    catalogVersion: CATALOG_VERSION,
    links: {
      skills: "/api/v1/skills",
      skillsManifest: "/api/v1/skills/manifest",
      swarms: "/api/v1/swarms",
      estimateSwarm: "/api/v1/swarms/estimate",
      jobs: "/api/v1/jobs",
      spawn: "/api/v1/spawn",
    },
    docs: "https://swarms.example.com/docs",
    auth: {
      scheme: "bearer",
      header: "Authorization",
      format: "Bearer <api-key>",
      hint: "Obtain an API key from your organization settings.",
    },
  };

  const cacheHeaders = { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };

  if (new URL(request.url).searchParams.get("format") === "markdown") {
    return formatResponse(request, body, { headers: cacheHeaders });
  }

  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cacheHeaders },
  });
}
