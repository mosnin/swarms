import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJsonBody, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { formatResponse } from "@/lib/format-response";
import { authenticateRequest } from "@/modules/identity/service";
import { createSchedule, listSchedules } from "@/modules/schedules/schedule-service";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum(["agent", "swarm", "simulation"]),
  cronExpression: z.string().min(1).max(128),
  timezone: z.string().max(64).optional(),
  request: z.record(z.string(), z.unknown()),
});

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const schedules = await listSchedules(ctx);
    if (new URL(request.url).searchParams.get("format") === "markdown") {
      return formatResponse(request, { schedules });
    }
    return ok({ schedules });
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");
    const json = await readJsonBody(request);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const schedule = await createSchedule(ctx, parsed.data);
    return ok({ schedule }, 201);
  });
}
