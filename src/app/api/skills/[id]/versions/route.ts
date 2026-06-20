import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { createDraftVersion } from "@/modules/catalog/skill-service";
import { RUNNER_TYPES } from "@/modules/catalog/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBody = z.object({
  manifest: z.unknown(),
  runnerType: z.enum(RUNNER_TYPES),
  runnerConfig: z.unknown().optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  priceCurrency: z.string().length(3).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { id } = await params;
    const json = await request.json().catch(() => null);
    const parsed = createBody.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const version = await createDraftVersion(ctx, id, {
      manifest: parsed.data.manifest,
      runnerType: parsed.data.runnerType,
      runnerConfig: parsed.data.runnerConfig,
      priceMinor: parsed.data.priceMinor,
      priceCurrency: parsed.data.priceCurrency,
    });
    return ok({ version }, 201);
  });
}
