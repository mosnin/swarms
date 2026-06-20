/**
 * LOCAL DEV ADAPTER: trigger in-process draining of the local job queue so the
 * full execution loop can be demonstrated without a separate worker. Disabled in
 * production, where the standalone worker (Phase 16) owns job processing.
 */

import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { drainLocalQueue } from "@/modules/execution/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest): Promise<Response> {
  return route(async () => {
    if (env.NODE_ENV === "production") {
      throw Errors.forbidden("In-process queue draining is disabled in production");
    }
    const processed = await drainLocalQueue();
    return ok({ processed });
  });
}
