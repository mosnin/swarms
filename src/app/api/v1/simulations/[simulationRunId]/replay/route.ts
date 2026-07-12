/**
 * POST /api/v1/simulations/:simulationRunId/replay
 *
 * Re-run a completed (or failed) simulation as a NEW run, optionally overriding
 * the objective, model, budget, or rounds — A/B the same persona crew against a
 * tweaked setup. The full crew config is recovered from the original director
 * job (the run row stores only a summary), and the inherited resources are
 * re-opened server-side. Goes back through the full enqueue path (policy gate,
 * budget reserve, ledger) with a fresh idempotency key.
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
import { enqueueSimulation } from "@/modules/simulations/simulation-service";
import { MAX_ROUNDS } from "@/modules/simulations/schema";
import type { ResolvedSimulationConfig } from "@/modules/simulations/schema";
import { openResourceBundle } from "@/modules/resources/resource-bundle";
import type { DirectorSimulationConfig } from "@/server/runners/simulationRunner";
import { enforceRateLimit } from "@/server/ratelimit/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const overridesSchema = z
  .object({
    objective: z.string().max(2_000).optional(),
    model: z.string().max(96).optional(),
    budgetMinor: z.number().int().nonnegative().optional(),
    maxRounds: z.number().int().positive().max(MAX_ROUNDS).optional(),
    replayTag: z.string().max(128).optional(),
  })
  .optional();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ simulationRunId: string }> },
): Promise<Response> {
  return route(async () => {
    const db = getDb();
    const ctx = await authenticateRequest(request);
    await enforceRateLimit(ctx, "swarmRun");

    const { simulationRunId } = await params;
    const original = (
      await db
        .select()
        .from(schema.simulationRuns)
        .where(
          and(
            eq(schema.simulationRuns.id, simulationRunId),
            eq(schema.simulationRuns.organizationId, ctx.organizationId),
          ),
        )
        .limit(1)
    )[0];
    if (!original) throw Errors.notFound(`Simulation run ${simulationRunId} not found`);

    // The full crew config lives in the director job's input, not the run row.
    if (!original.directorJobId) {
      throw Errors.validation("Cannot replay: original simulation has no director job to recover the config from");
    }
    const director = (
      await db.select().from(schema.jobs).where(eq(schema.jobs.id, original.directorJobId)).limit(1)
    )[0];
    const directorConfig = (director?.input ?? {}) as Partial<DirectorSimulationConfig>;
    const config = directorConfig.config as ResolvedSimulationConfig | undefined;
    if (!config || !Array.isArray(config.agents) || config.agents.length === 0) {
      throw Errors.validation("Cannot replay: original simulation config is not recoverable");
    }

    const json = await readJsonBody(request).catch(() => null);
    const parsed = overridesSchema.safeParse(json ?? {});
    if (!parsed.success) {
      throw Errors.validation("Invalid override body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const overrides = parsed.data ?? {};

    const storedInput = (original.input ?? {}) as { budgetMinor?: number | null };
    const resources = directorConfig.resourceBundleId
      ? await openResourceBundle(ctx.organizationId, directorConfig.resourceBundleId, db).catch(() => ({}))
      : {};

    const scenario =
      config.mode === "collaborative"
        ? { ...(config.scenario ?? {}), ...(overrides.maxRounds !== undefined ? { maxRounds: overrides.maxRounds } : {}) }
        : undefined;

    const idempotencyKey = deriveIdempotencyKey(ctx.organizationId, {
      originalSimulationRunId: simulationRunId,
      replayTag: overrides.replayTag ?? "replay",
      objective: overrides.objective ?? null,
      model: overrides.model ?? null,
      budgetMinor: overrides.budgetMinor ?? null,
      maxRounds: overrides.maxRounds ?? null,
    });

    const response = await enqueueSimulation(
      ctx,
      {
        mode: config.mode,
        frameworkId: config.frameworkId,
        objective: overrides.objective ?? config.objective,
        agents: config.agents,
        model: overrides.model ?? config.model,
        resources,
        scenario,
        aggregatorTask: config.aggregatorTask,
        budgetMinor: overrides.budgetMinor ?? storedInput.budgetMinor ?? undefined,
        currency: original.costCurrency,
        idempotencyKey,
        callbackUrl: directorConfig.callbackUrl,
      } as never,
      db,
    );

    return ok({ ...response, replayedFrom: simulationRunId }, 202);
  });
}
