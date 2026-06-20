/**
 * Owner-only diagnostics. Returns coarse, non-sensitive operational counts for
 * the caller's organization. Output is redacted defensively before return.
 */

import type { NextRequest } from "next/server";
import { and, count, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { ok, route } from "@/lib/api";
import { redact } from "@/lib/redaction";
import { requestIdFrom } from "@/lib/request-id";
import { Errors } from "@/lib/errors";
import { roleOf } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const ctx = await authenticateRequest(request);
    if (roleOf(ctx) !== "owner") {
      throw Errors.forbidden("Diagnostics require the owner role");
    }
    const db = getDb();
    const org = ctx.organizationId;

    const [jobs, succeeded, failed, queued, skills, auditEvents] = await Promise.all([
      db.select({ c: count() }).from(schema.jobs).where(eq(schema.jobs.organizationId, org)),
      db.select({ c: count() }).from(schema.jobs).where(and(eq(schema.jobs.organizationId, org), eq(schema.jobs.status, "succeeded"))),
      db.select({ c: count() }).from(schema.jobs).where(and(eq(schema.jobs.organizationId, org), eq(schema.jobs.status, "failed"))),
      db.select({ c: count() }).from(schema.jobs).where(and(eq(schema.jobs.organizationId, org), eq(schema.jobs.status, "queued"))),
      db.select({ c: count() }).from(schema.skills).where(eq(schema.skills.organizationId, org)),
      db.select({ c: count() }).from(schema.auditEvents).where(eq(schema.auditEvents.organizationId, org)),
    ]);

    return ok(
      redact({
        requestId: requestIdFrom(request.headers),
        organizationId: org,
        jobs: {
          total: jobs[0]?.c ?? 0,
          succeeded: succeeded[0]?.c ?? 0,
          failed: failed[0]?.c ?? 0,
          queued: queued[0]?.c ?? 0,
        },
        skills: skills[0]?.c ?? 0,
        auditEvents: auditEvents[0]?.c ?? 0,
      }),
    );
  });
}
