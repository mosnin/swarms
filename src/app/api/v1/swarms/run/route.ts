import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { authenticateRequest } from "@/modules/identity/service";
import { runSwarm } from "@/modules/swarms/swarm-repository";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  templateId: z.string().min(1),
  objective: z.string().min(1).max(2000),
  input: z.record(z.unknown()).optional(),
  budgetMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    enforceRateLimit(ctx, "swarmRun");
    const json = await request.json().catch(() => null);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const run = await runSwarm(ctx, parsed.data);
    return ok({ run }, 201);
  });
}
