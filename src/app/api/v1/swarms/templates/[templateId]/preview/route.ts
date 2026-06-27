/**
 * POST /api/v1/swarms/templates/:templateId/preview
 *
 * Dry-run a template expansion: supply an objective and get back the exact
 * task strings, aggregatorTask (if any), and sequential flag that would be
 * used when spawning with this template. No resources are consumed.
 *
 * Body: { objective: string }
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { expandTemplate, findTemplate } from "@/server/swarms/swarm-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  objective: z.string().max(2_000).default(""),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
): Promise<Response> {
  return route(async () => {
    const { templateId } = await params;
    const template = findTemplate(templateId);
    if (!template) throw Errors.notFound(`Unknown template: "${templateId}"`);

    const json = await request.json().catch(() => ({}));
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const expanded = expandTemplate(template, parsed.data.objective);
    return ok({
      templateId: template.id,
      templateName: template.name,
      objective: parsed.data.objective,
      workerCount: expanded.tasks.length,
      sequential: expanded.sequential,
      tasks: expanded.tasks,
      aggregatorTask: expanded.aggregatorTask ?? null,
    });
  });
}
