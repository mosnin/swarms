/**
 * GET /api/v1/skills
 *
 * Returns the full Swarms skill catalog: every capability, its JSON Schema,
 * curl examples, and an OpenAI-compatible function-calling tool definition.
 *
 * Public endpoint — no authentication required. Responses are cached at the
 * CDN for 60 s; the Etag is the catalogVersion so CDN + client caches
 * invalidate automatically on any skill version bump.
 */

import type { NextRequest } from "next/server";

import { formatResponse } from "@/lib/format-response";
import { SKILL_CATALOG } from "@/server/skills/skill-registry";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET(request: NextRequest): Response {
  return formatResponse(request, SKILL_CATALOG, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      Etag: `"${SKILL_CATALOG.catalogVersion}"`,
    },
  });
}
