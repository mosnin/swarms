/**
 * GET /api/v1/swarms/templates
 *
 * Returns all available swarm templates. No authentication required —
 * agents browse templates to pick the right pattern for their task.
 *
 * Pass ?format=markdown for a human-readable rendering.
 *
 * To use a template, pass templateId in POST /api/v1/swarms. The template
 * expands into default tasks/aggregatorTask/sequential that you can
 * override individually.
 */

import type { NextRequest } from "next/server";

import { formatResponse } from "@/lib/format-response";
import { SWARM_TEMPLATES } from "@/server/swarms/swarm-templates";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET(request: NextRequest): Response {
  return formatResponse(
    request,
    { templates: SWARM_TEMPLATES },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
  );
}
