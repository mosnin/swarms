/**
 * LOCAL DEV ADAPTER: trigger in-process draining of the local job queue so the
 * full execution loop can be demonstrated without a separate worker. Disabled in
 * production, where the standalone worker (Phase 16) owns job processing.
 *
 * Security: requires the x-internal-secret header (INTERNAL_WORKER_SECRET env
 * var). In dev the secret is optional — any value is accepted when the env var
 * is not set. In production the route is fully disabled.
 */

import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { drainLocalQueue } from "@/modules/execution/worker";

const INTERNAL_SECRET_HEADER = "x-internal-secret";

function verifyInternalSecret(request: NextRequest): void {
  // Production: route is always disabled (real worker calls jobs directly).
  if (env.NODE_ENV === "production") {
    throw Errors.forbidden("In-process queue draining is disabled in production");
  }

  // Dev/test: if INTERNAL_WORKER_SECRET is configured, enforce it.
  if (env.INTERNAL_WORKER_SECRET) {
    const provided = request.headers.get(INTERNAL_SECRET_HEADER);
    if (!provided) {
      throw Errors.unauthorized(`${INTERNAL_SECRET_HEADER} header is required`);
    }
    // Constant-time comparison to prevent timing-based secret leakage.
    const expectedBuf = Buffer.from(env.INTERNAL_WORKER_SECRET, "utf8");
    const providedBuf = Buffer.from(provided, "utf8");
    const safe =
      expectedBuf.length === providedBuf.length &&
      timingSafeEqual(expectedBuf, providedBuf);
    if (!safe) {
      throw Errors.unauthorized("Invalid internal secret");
    }
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    verifyInternalSecret(request);
    const processed = await drainLocalQueue();
    return ok({ processed });
  });
}
