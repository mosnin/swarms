import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { roleOf } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";
import { reconcileOrganization } from "@/modules/billing/reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    if (roleOf(ctx) !== "owner") {
      throw Errors.forbidden("Reconciliation requires the owner role");
    }
    const report = await reconcileOrganization(ctx);
    return ok(report);
  });
}
