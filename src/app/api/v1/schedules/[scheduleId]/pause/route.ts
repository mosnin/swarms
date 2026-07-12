import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { setScheduleStatus } from "@/modules/schedules/schedule-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { scheduleId } = await params;
    const schedule = await setScheduleStatus(ctx, scheduleId, "paused");
    return ok({ schedule });
  });
}
