import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { idempotencyKeySchema } from "@/lib/idempotency";
import { decodePaymentHeader } from "@/modules/billing/payment-service";
import { executePaidSkill } from "@/modules/billing/payment-repository";
import { authenticateRequest } from "@/modules/identity/service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYMENT_HEADER = "x-payment";

const body = z.object({
  organizationId: z.string().optional(),
  skillSlug: z.string().min(1).max(96),
  skillVersion: z.string().max(32).optional(),
  input: z.unknown(),
  idempotencyKey: idempotencyKeySchema,
  currency: z.string().length(3).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    enforceRateLimit(ctx, "executePaid");
    const json = await request.json().catch(() => null);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const proof = decodePaymentHeader(request.headers.get(PAYMENT_HEADER));

    try {
      const result = await executePaidSkill(
        ctx,
        {
          skillSlug: parsed.data.skillSlug,
          skillVersion: parsed.data.skillVersion,
          input: parsed.data.input,
          idempotencyKey: parsed.data.idempotencyKey,
          currency: parsed.data.currency,
        },
        proof,
      );

      if (result.kind === "payment_required") {
        // x402: advertise the payment requirements with HTTP 402.
        return NextResponse.json(
          { error: { code: "PAYMENT_REQUIRED", message: "Payment required" }, accepts: [result.requirements] },
          { status: 402, headers: { "x-payment-required": "true" } },
        );
      }
      return ok(result.response, 201);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
