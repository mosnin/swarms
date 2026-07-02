/**
 * GET /api/v1/skills/:id
 *
 * Returns a single skill definition by its id (e.g. "spawn-swarm").
 * Returns 404 when the id is unknown. Public, no authentication required.
 */

import type { NextRequest } from "next/server";

import { formatResponse } from "@/lib/format-response";
import { SKILL_CATALOG } from "@/server/skills/skill-registry";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return params.then(({ id }) => {
    const skill = SKILL_CATALOG.skills.find((s) => s.id === id);
    if (!skill) {
      return formatResponse(request, { error: { code: "NOT_FOUND", message: `Unknown skill: ${id}` } }, { status: 404 });
    }
    return formatResponse(request, skill, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        Etag: `"${skill.version}"`,
      },
    });
  });
}
