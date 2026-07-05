/**
 * POST /api/v1/swarms/:swarmRunId/replay
 *
 * Re-run a completed (or failed) swarm with the same configuration. Creates
 * a new swarm run — the original is untouched. The response is identical to
 * POST /api/v1/swarms: it returns the new swarmRunId and worker results.
 *
 * Callers may supply an optional body to override individual fields:
 *   model         — swap the model for the replay
 *   budgetMinor   — increase the budget for a retry
 *   objective     — refine the objective
 *
 * The idempotency key is always fresh (derived from the original run ID +
 * current timestamp supplied by the caller), so replays never collide.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";

import { ok, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { deriveIdempotencyKey } from "@/lib/idempotency";
import { requireOrganization } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";
import { enqueueSwarm } from "@/modules/swarms/spawn-swarm";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const overridesSchema = z
  .object({
    model: z.string().max(96).optional(),
    budgetMinor: z.number().int().nonnegative().optional(),
    objective: z.string().max(2_000).optional(),
    /**
     * Opaque caller-supplied tag that feeds into the idempotency key so the
     * same replay request can be retried safely (default: "replay").
     */
    replayTag: z.string().max(128).optional(),
  })
  .optional();

interface StoredSwarmInput {
  objective?: string | null;
  workerCount?: number;
  model?: string;
  sequential?: boolean;
  aggregatorTask?: string | null;
  budgetMinor?: number | null;
  currency?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ swarmRunId: string }> },
): Promise<Response> {
  return route(async () => {
    const db = getDb();
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "swarmRun");

    const { swarmRunId } = await params;

    // Fetch original run (enforces org membership).
    const originalRun = (
      await db
        .select()
        .from(schema.swarmRuns)
        .where(
          and(
            eq(schema.swarmRuns.id, swarmRunId),
            eq(schema.swarmRuns.organizationId, ctx.organizationId),
          ),
        )
        .limit(1)
    )[0];

    if (!originalRun) throw Errors.notFound(`Swarm run ${swarmRunId} not found`);
    requireOrganization(ctx, originalRun.organizationId);

    // Reconstruct tasks from the original agent rows (ordered by creation time).
    const agentRows = await db
      .select({ input: schema.swarmAgents.input })
      .from(schema.swarmAgents)
      .where(eq(schema.swarmAgents.swarmRunId, swarmRunId))
      .orderBy(asc(schema.swarmAgents.createdAt));

    const tasks = agentRows
      .map((a) => (a.input as { task?: string } | null)?.task ?? "")
      .filter((t) => t.length > 0);

    if (tasks.length === 0) {
      throw Errors.validation("Cannot replay: original swarm has no recoverable tasks");
    }

    const stored = (originalRun.input ?? {}) as StoredSwarmInput;

    // Parse optional overrides.
    const json = await request.json().catch(() => null);
    const parsed = overridesSchema.safeParse(json ?? {});
    if (!parsed.success) {
      throw Errors.validation("Invalid override body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const overrides = parsed.data ?? {};

    const replayTag = overrides.replayTag ?? "replay";
    const objective = overrides.objective ?? stored.objective ?? undefined;
    const model = overrides.model ?? stored.model;
    const budgetMinor = overrides.budgetMinor ?? stored.budgetMinor ?? undefined;
    const currency = stored.currency ?? "USD";
    const sequential = stored.sequential ?? false;
    const aggregatorTask = stored.aggregatorTask ?? undefined;

    // Fresh idempotency key — never re-uses the original run's key.
    const idempotencyKey = deriveIdempotencyKey(ctx.organizationId, {
      originalSwarmRunId: swarmRunId,
      replayTag,
    });

    const response = await enqueueSwarm(ctx, {
      tasks,
      objective,
      model,
      budgetMinor,
      currency,
      sequential,
      aggregatorTask,
      idempotencyKey,
    });

    return ok({ ...response, replayedFrom: swarmRunId }, 202);
  });
}
