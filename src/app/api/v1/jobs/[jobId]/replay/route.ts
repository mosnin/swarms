/**
 * POST /api/v1/jobs/:jobId/replay
 *
 * Re-run a completed (or failed) agent job as a NEW job, optionally overriding
 * the task, model, or budget — the A/B experimentation flywheel for single
 * agents. The original job is untouched; its encrypted resource bundle is
 * opened server-side and re-attached, so the replay inherits the same secrets,
 * files, and MCP servers without them ever leaving the server. The replay goes
 * back through the full spawn path (policy gate, budget reserve, ledger), and
 * gets a fresh idempotency key so replays never collide with the original.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { ok, readJsonBody, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { deriveIdempotencyKey } from "@/lib/idempotency";
import { authenticateRequest } from "@/modules/identity/service";
import { spawnAgent } from "@/modules/agents/spawn-service";
import { openResourceBundle } from "@/modules/resources/resource-bundle";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const overridesSchema = z
  .object({
    task: z.string().min(1).max(20_000).optional(),
    model: z.string().max(96).optional(),
    budgetMinor: z.number().int().nonnegative().optional(),
    /** Feeds the idempotency key so the same replay request retries safely. */
    replayTag: z.string().max(128).optional(),
  })
  .optional();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  return route(async () => {
    const db = getDb();
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "execute");

    const { jobId } = await params;
    const original = (
      await db
        .select()
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.organizationId, ctx.organizationId)))
        .limit(1)
    )[0];
    if (!original) throw Errors.notFound(`Job ${jobId} not found`);
    if (original.capabilityKind !== "agent") {
      throw Errors.validation(
        `Only agent jobs can be replayed here; use the ${original.capabilityKind} run's own replay endpoint`,
      );
    }
    if (!original.task) throw Errors.validation("Cannot replay: original job has no recoverable task");

    const json = await readJsonBody(request).catch(() => null);
    const parsed = overridesSchema.safeParse(json ?? {});
    if (!parsed.success) {
      throw Errors.validation("Invalid override body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const overrides = parsed.data ?? {};

    // Reconstruct the original budget from the stored execution params.
    const input = (original.input ?? {}) as { maxGpuSeconds?: number; rateMinorPerSecond?: number };
    const originalBudget =
      typeof input.maxGpuSeconds === "number" && typeof input.rateMinorPerSecond === "number"
        ? input.maxGpuSeconds * input.rateMinorPerSecond
        : undefined;

    // Re-open the inherited resources server-side (org-scoped decryption); the
    // spawn path re-encrypts them into a fresh bundle for the new job.
    const resources = original.resourceBundleId
      ? await openResourceBundle(ctx.organizationId, original.resourceBundleId, db).catch(() => ({}))
      : {};

    const idempotencyKey = deriveIdempotencyKey(ctx.organizationId, {
      originalJobId: jobId,
      replayTag: overrides.replayTag ?? "replay",
      task: overrides.task ?? null,
      model: overrides.model ?? null,
      budgetMinor: overrides.budgetMinor ?? null,
    });

    const response = await spawnAgent(
      ctx,
      {
        task: overrides.task ?? original.task,
        resources,
        model: overrides.model ?? original.model ?? undefined,
        budgetMinor: overrides.budgetMinor ?? originalBudget,
        currency: original.costCurrency,
        idempotencyKey,
        callbackUrl: original.callbackUrl ?? undefined,
      },
      db,
    );

    return ok({ ...response, replayedFrom: jobId }, 202);
  });
}
