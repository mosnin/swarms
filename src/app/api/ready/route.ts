import { NextResponse } from "next/server";

import { pingDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Readiness probe. Verifies the process can serve traffic by checking its
 * critical dependency (Postgres, the system of record). Returns 503 when not
 * ready so load balancers/orchestrators withhold traffic.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const dbReady = await pingDatabase();
  const ready = dbReady;

  if (!ready) {
    logger.warn("Readiness check failed", { checks: { database: dbReady } });
  }

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      checks: { database: dbReady ? "up" : "down" },
      time: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
