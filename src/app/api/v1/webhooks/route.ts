/**
 * GET  /api/v1/webhooks   — list registered org-level webhook endpoints
 * POST /api/v1/webhooks   — register a new endpoint
 *
 * Endpoints receive every swarm lifecycle and budget alert event for the
 * organisation, without requiring a per-request callbackUrl.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { assertSafeUrl } from "@/lib/ssrf-guard";
import { authenticateRequest } from "@/modules/identity/service";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
} from "@/modules/webhooks/endpoint-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBody = z.object({
  url: z.string().url(),
  description: z.string().max(255).optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const endpoints = await listWebhookEndpoints(ctx);
    return ok({ endpoints });
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
    // SSRF guard: validate the webhook URL before persisting it.
    await assertSafeUrl(parsed.data.url, "url");
    const endpoint = await createWebhookEndpoint(ctx, parsed.data);
    return ok({ endpoint }, 201);
  });
}
