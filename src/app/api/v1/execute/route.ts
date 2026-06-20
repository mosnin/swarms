import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { idempotencyKeySchema } from "@/lib/idempotency";
import { requireOrganization } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";
import { executeSkill } from "@/modules/execution/job-repository";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const executeBody = z.object({
  organizationId: z.string().optional(),
  skillSlug: z.string().min(1).max(96),
  skillVersion: z.string().max(32).optional(),
  input: z.unknown(),
  idempotencyKey: idempotencyKeySchema,
  budgetMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  callbackUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    enforceRateLimit(ctx, "execute");
    const json = await request.json().catch(() => null);
    const parsed = executeBody.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    // If the caller names an organization, it must be their own.
    if (parsed.data.organizationId) requireOrganization(ctx, parsed.data.organizationId);

    const response = await executeSkill(ctx, {
      skillSlug: parsed.data.skillSlug,
      skillVersion: parsed.data.skillVersion,
      input: parsed.data.input,
      idempotencyKey: parsed.data.idempotencyKey,
      budgetMinor: parsed.data.budgetMinor,
      currency: parsed.data.currency,
    });
    return ok(response, 201);
  });
}
