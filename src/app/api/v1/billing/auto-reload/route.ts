import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { getAutoReload, setAutoReload } from "@/modules/billing/credit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  enabled: z.boolean(),
  thresholdMinor: z.number().int().nonnegative(),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  minIntervalSeconds: z.number().int().positive().optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const autoReload = await getAutoReload(ctx);
    return ok({ autoReload });
  });
}

export async function PUT(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const json = await readJsonBody(request);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const autoReload = await setAutoReload(ctx, parsed.data);
    return ok({ autoReload });
  });
}
