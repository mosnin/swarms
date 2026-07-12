import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, readJsonBody, route } from "@/lib/api";
import { authenticateRequest } from "@/modules/identity/service";
import { rejectGatedJob } from "@/modules/approvals/approval-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ reason: z.string().max(1_000).optional() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    const { jobId } = await params;
    const json = await readJsonBody(request).catch(() => ({}));
    const parsed = body.safeParse(json ?? {});
    const reason = parsed.success ? parsed.data.reason : undefined;
    const result = await rejectGatedJob(ctx, jobId, reason);
    return ok(result);
  });
}
