import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { reviewSkill } from "@/modules/catalog/skill-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ approve: z.boolean(), notes: z.string().max(1000).optional() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { id } = await params;
    const json = await request.json().catch(() => null);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const skill = await reviewSkill(ctx, id, parsed.data);
    return ok({ skill });
  });
}
