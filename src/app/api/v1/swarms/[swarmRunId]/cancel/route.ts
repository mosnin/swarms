/**
 * POST /api/v1/swarms/:swarmRunId/cancel
 *
 * Immediately cancels a swarm run. Any queued or running workers are marked
 * cancelled and their outstanding budget reservations are released so the
 * org's headroom is restored. Workers that already reached a terminal state
 * (succeeded / failed / cancelled) are left unchanged.
 *
 * Idempotent: cancelling an already-cancelled (or completed) swarm is a no-op
 * that returns the current run state without error.
 *
 * Response:
 *   swarmRunId      — the run that was cancelled
 *   status          — "cancelled" (or the existing terminal status if already done)
 *   cancelledAgents — number of worker slots that were mid-flight and got cancelled
 *   releasedMinor   — total budget released back to the org's headroom
 */

import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { cancelSwarm } from "@/modules/swarms/cancel-swarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ swarmRunId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { swarmRunId } = await params;
    const result = await cancelSwarm(ctx, swarmRunId);
    return ok(result);
  });
}
