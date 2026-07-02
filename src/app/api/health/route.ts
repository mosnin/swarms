import { NextResponse } from "next/server";

/**
 * Liveness probe. Reports that the process is up and serving. It performs no
 * dependency checks and intentionally avoids reading validated env so it stays
 * green even when downstreams are degraded — use `/api/ready` for readiness.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      service: "swarms",
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    },
    { status: 200 },
  );
}
