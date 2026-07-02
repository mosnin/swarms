import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest, revokeApiKey } from "@/modules/identity/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { id } = await context.params;
    const key = await revokeApiKey(ctx, id);
    return ok({ key });
  });
}
