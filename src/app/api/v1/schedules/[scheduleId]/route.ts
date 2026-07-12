import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { formatResponse } from "@/lib/format-response";
import { authenticateRequest } from "@/modules/identity/service";
import { deleteSchedule, getSchedule } from "@/modules/schedules/schedule-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { scheduleId } = await params;
    const schedule = await getSchedule(ctx, scheduleId);
    if (new URL(request.url).searchParams.get("format") === "markdown") {
      return formatResponse(request, { schedule });
    }
    return ok({ schedule });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { scheduleId } = await params;
    await deleteSchedule(ctx, scheduleId);
    return ok({ deleted: true });
  });
}
