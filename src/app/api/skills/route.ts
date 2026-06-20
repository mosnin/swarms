import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { createSkill, listSkills } from "@/modules/catalog/skill-service";
import { RISK_LEVELS } from "@/modules/catalog/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBody = z.object({
  slug: z.string().min(1).max(96),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
  riskLevel: z.enum(RISK_LEVELS).optional(),
  tags: z.array(z.string().min(1).max(48)).max(32).optional(),
  requiredPermissions: z.array(z.string()).optional(),
  defaultPriceMinor: z.number().int().nonnegative().optional(),
  priceCurrency: z.string().length(3).optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const url = new URL(request.url);
    const skills = await listSkills(ctx, {
      query: url.searchParams.get("q") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      scope: url.searchParams.get("scope") === "owned" ? "owned" : "all",
    });
    return ok({ skills });
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const json = await request.json().catch(() => null);
    const parsed = createBody.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const skill = await createSkill(ctx, parsed.data);
    return ok({ skill }, 201);
  });
}
