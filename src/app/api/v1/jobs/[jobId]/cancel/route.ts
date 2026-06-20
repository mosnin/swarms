import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { cancelJob } from "@/modules/execution/job-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { jobId } = await params;
    const job = await cancelJob(ctx, jobId);
    return ok({ job });
  });
}
