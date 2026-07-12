/**
 * POST /api/v1/simulations/estimate
 *
 * Dry-run cost preview for a proposed simulation — no run is created and no
 * funds are reserved. Returns the base fee, GPU estimate, cost, and whether the
 * budget covers it, so an MCP agent can price a run before committing.
 */

import type { NextRequest } from "next/server";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { simulationConfigSchema } from "@/modules/simulations/schema";
import { estimateSimulation } from "@/modules/simulations/simulation-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const json = await readJsonBody(request);
    const parsed = simulationConfigSchema.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    return ok(estimateSimulation(parsed.data));
  });
}
