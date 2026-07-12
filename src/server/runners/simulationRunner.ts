/**
 * SimulationRunner: executes a simulation director job. Unlike the swarm
 * director (which fans out to N separately-billed worker jobs and is itself
 * charged nothing), a simulation runs the WHOLE crew in one sandbox, so this
 * runner is a normal poller-claimed, charged job. It:
 *
 *   1. adopts the pre-created simulation_run row (queued → running, CAS),
 *   2. opens the inherited resource bundle,
 *   3. runs the CrewAI crew via the simulation runtime (mock or Modal /simulate),
 *   4. records per-persona rows + the run's output/cost breakdown,
 *   5. returns the single charge (base*agents + gpuSeconds*rate).
 *
 * The dynamic imports break the static cycle runnerRegistry → simulationRunner →
 * (db/schema/runtime), consistent with swarmRunner.
 */

import type { ResolvedSimulationConfig } from "@/modules/simulations/schema";
import type { Runner, RunnerContext, RunnerOutcome } from "@/server/runners/types";

export interface DirectorSimulationConfig {
  config: ResolvedSimulationConfig;
  existingRunId: string;
  resourceBundleId?: string;
  /** Exact base fee (agents * SIMULATION_AGENT_BASE_MINOR). */
  baseFeeMinor: number;
  /** Hard cap on billable GPU seconds (derived from budget). */
  maxGpuSeconds: number;
  rateMinorPerSecond: number;
  currency: string;
  callbackUrl?: string;
  apiKeyId: string | null;
  createdByUserId: string | null;
}

export class SimulationRunner implements Runner {
  readonly type = "simulation" as const;

  async run(context: RunnerContext): Promise<RunnerOutcome> {
    const cfg = context.runnerConfig as DirectorSimulationConfig;
    if (!cfg.config || !cfg.existingRunId) {
      return {
        ok: false,
        error: { code: "INVALID_CONFIG", message: "Simulation director config is missing config/existingRunId" },
        logs: [],
      };
    }

    const { getDb } = await import("@/lib/db");
    const schema = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const { openResourceBundle } = await import("@/modules/resources/resource-bundle");
    const { getSimulationRuntime } = await import("@/server/simulations/simulationRuntime");
    const { fanOutWebhook } = await import("@/modules/webhooks/webhook-service");
    const db = getDb();

    // Best-effort terminal-state webhook: per-request callbackUrl + org endpoints.
    const notify = (status: string, data: Record<string, unknown>) =>
      fanOutWebhook(
        {
          organizationId: context.organizationId,
          eventType: `simulation.${status}`,
          url: cfg.callbackUrl,
          data: { simulationRunId: cfg.existingRunId, status, ...data },
        },
        db,
      ).catch(() => undefined);

    // Claim the run: queued → running. If the CAS misses, the run was cancelled
    // or already picked up — do not execute or charge.
    const claimed = (
      await db
        .update(schema.simulationRuns)
        .set({ status: "running", startedAt: new Date() })
        .where(
          and(
            eq(schema.simulationRuns.id, cfg.existingRunId),
            eq(schema.simulationRuns.organizationId, context.organizationId),
            eq(schema.simulationRuns.status, "queued"),
          ),
        )
        .returning()
    )[0];
    if (!claimed) {
      return {
        ok: false,
        error: { code: "CANCELLED", message: "Simulation run was not claimable (cancelled or already running)" },
        logs: [{ level: "warn", message: "simulation run not in 'queued' state; skipping" }],
      };
    }

    const resources = cfg.resourceBundleId
      ? await openResourceBundle(context.organizationId, cfg.resourceBundleId, db).catch(() => ({}))
      : {};

    const result = await getSimulationRuntime().run({
      simulationRunId: cfg.existingRunId,
      organizationId: context.organizationId,
      config: cfg.config,
      resources,
      maxRuntimeMs: context.maxRuntimeMs,
      maxGpuSeconds: cfg.maxGpuSeconds,
    });

    if (!result.ok) {
      // CAS running → failed; do not overwrite a run cancelled mid-flight.
      await db
        .update(schema.simulationRuns)
        .set({ status: "failed", output: { error: result.error }, finishedAt: new Date() })
        .where(and(eq(schema.simulationRuns.id, cfg.existingRunId), eq(schema.simulationRuns.status, "running")));
      await notify("failed", { error: result.error });
      return { ok: false, error: result.error, logs: result.logs };
    }

    // One charge for the whole crew: exact base fee + metered GPU (bounded to cap).
    const gpuSeconds = Math.min(result.gpuSeconds, Math.max(cfg.maxGpuSeconds, 1));
    const costMinor = cfg.baseFeeMinor + gpuSeconds * cfg.rateMinorPerSecond;

    // Persist per-persona records (records, not billed jobs).
    if (result.byPersona.length > 0) {
      await db.insert(schema.simulationAgents).values(
        result.byPersona.map((p) => ({
          simulationRunId: cfg.existingRunId,
          personaName: p.personaName,
          role: p.role ?? null,
          status: p.status,
          output: p.output ?? null,
          error: p.error ?? null,
        })),
      );
    }

    // CAS running → succeeded so a concurrent cancel is not clobbered.
    const settled = (
      await db
        .update(schema.simulationRuns)
        .set({
          status: "succeeded",
          output: {
            findings: result.output,
            transcript: result.transcript ?? null,
            byPersona: result.byPersona,
            aggregatorOutput: result.aggregatorOutput ?? null,
          },
          costMinor,
          baseFeeMinor: cfg.baseFeeMinor,
          gpuSeconds,
          finishedAt: new Date(),
        })
        .where(and(eq(schema.simulationRuns.id, cfg.existingRunId), eq(schema.simulationRuns.status, "running")))
        .returning()
    )[0];

    if (!settled) {
      // Cancelled/settled concurrently — do not charge for a run that is no
      // longer ours.
      return {
        ok: false,
        error: { code: "CANCELLED", message: "Simulation was settled concurrently; charge skipped" },
        logs: result.logs,
      };
    }

    await notify("succeeded", {
      personaCount: result.byPersona.length,
      costMinor,
      currency: cfg.currency,
    });

    return {
      ok: true,
      output: settled.output,
      costMinor,
      logs: [
        ...result.logs,
        {
          level: "info",
          message: `simulation completed: personas=${result.byPersona.length} gpuSeconds=${gpuSeconds} cost=${costMinor}`,
        },
      ],
    };
  }
}
