/**
 * GET /api/v1/swarms/templates/:templateId
 *
 * Return a single swarm template by id. Pass ?format=markdown for
 * human-readable output. Returns 404 when the template id is unknown.
 */

import type { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api";
import { formatResponse } from "@/lib/format-response";
import { Errors } from "@/lib/errors";
import { findTemplate } from "@/server/swarms/swarm-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
): Promise<Response> {
  try {
    const { templateId } = await params;
    const template = findTemplate(templateId);
    if (!template) throw Errors.notFound(`Unknown template: "${templateId}"`);
    return formatResponse(
      request,
      { template },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
