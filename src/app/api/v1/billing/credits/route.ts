import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { grantCredit } from "@/modules/billing/credit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  reason: z.string().max(500).optional(),
  refId: z.string().max(255).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const json = await readJsonBody(request);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const result = await grantCredit(ctx, parsed.data);
    return ok(result, 201);
  });
}
