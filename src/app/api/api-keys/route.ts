import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest, createApiKey, listApiKeys } from "@/modules/identity/service";
import { PERMISSIONS, type Permission } from "@/modules/identity/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const permissionEnum = z.enum(PERMISSIONS as unknown as [Permission, ...Permission[]]);

const createBody = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(permissionEnum).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

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
    const result = await createApiKey(ctx, {
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    });
    // The plaintext key is returned here exactly once.
    return ok(result, 201);
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const keys = await listApiKeys(ctx);
    return ok({ keys });
  });
}
