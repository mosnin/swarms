/**
 * GET  /api/v1/keys  — list API keys for the authenticated org
 * POST /api/v1/keys  — create a new API key (plaintext returned once)
 *
 * Callers need the api_keys.manage permission. When creating, the optional
 * `budgetMinor` field auto-creates a hard-stop monthly budget scoped to the
 * new key so downstream jobs cannot exceed the cap.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest, createApiKey, listApiKeys } from "@/modules/identity/service";
import type { Permission } from "@/modules/identity/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBody = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  budgetMinor: z.number().int().positive().optional(),
  budgetCurrency: z.string().length(3).toUpperCase().optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const keys = await listApiKeys(ctx);
    return ok({ keys });
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
    const { name, scopes, expiresAt, budgetMinor, budgetCurrency } = parsed.data;
    const result = await createApiKey(ctx, {
      name,
      scopes: scopes as Permission[] | undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      budgetMinor,
      budgetCurrency,
    });
    return ok({ plaintext: result.plaintext, key: result.key }, 201);
  });
}
