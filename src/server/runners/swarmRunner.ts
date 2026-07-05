/**
 * SwarmRunner: a runner that executes a director job by spawning a child swarm.
 * This enables the hierarchical swarm pattern — one coordinator job fans out to
 * N worker agents, then optionally aggregates their results.
 *
 * The dynamic import of spawnSwarm breaks the otherwise-circular static dep:
 *   runnerRegistry → swarmRunner (static)
 *   swarmRunner → spawn-swarm (dynamic, only at run time)
 *   spawn-swarm → worker → runnerRegistry (static)
 */

import { agentContext } from "@/modules/identity/access-control";
import type { Runner, RunnerContext, RunnerOutcome } from "@/server/runners/types";

export interface DirectorSwarmConfig {
  tasks: string[];
  objective?: string;
  model?: string;
  budgetMinor?: number;
  currency?: string;
  aggregatorTask?: string;
  sequential?: boolean;
  workerTimeouts?: number[];
  deduplicateStrict?: boolean;
  callbackUrl?: string;
  /** Propagated from the director job to construct the child auth context. */
  apiKeyId: string | null;
  createdByUserId: string | null;
  /** Child swarm idempotency key (set to director-<jobId> by resolveExecution). */
  idempotencyKey: string;
  /**
   * When set, execute into this pre-created swarm run (the async path: the run
   * row + resource bundle were created by enqueueSwarm in the request handler).
   * When absent, spawnSwarm creates a fresh run (legacy/director-of-director).
   */
  existingRunId?: string;
  resourceBundleId?: string;
}

export class SwarmRunner implements Runner {
  readonly type = "swarm" as const;

  async run(context: RunnerContext): Promise<RunnerOutcome> {
    const config = context.runnerConfig as DirectorSwarmConfig;

    if (!config.tasks || config.tasks.length === 0) {
      return {
        ok: false,
        error: { code: "INVALID_CONFIG", message: "Director swarm config has no tasks" },
        logs: [],
      };
    }

    // Build a minimal agent auth context from the director job's originating principal.
    const ctx = agentContext({
      organizationId: context.organizationId,
      apiKeyId: config.apiKeyId ?? null,
      userId: config.createdByUserId ?? null,
      scopes: ["jobs.create"],
    });

    // Dynamic import breaks the static circular dependency chain.
    const { spawnSwarm } = await import("@/modules/swarms/spawn-swarm");
    const { getDb } = await import("@/lib/db");

    try {
      const result = await spawnSwarm(
        ctx,
        {
          tasks: config.tasks,
          objective: config.objective,
          model: config.model,
          budgetMinor: config.budgetMinor,
          currency: config.currency,
          aggregatorTask: config.aggregatorTask,
          sequential: config.sequential,
          workerTimeouts: config.workerTimeouts,
          deduplicateStrict: config.deduplicateStrict,
          callbackUrl: config.callbackUrl,
          idempotencyKey: config.idempotencyKey,
        },
        getDb(),
        { existingRunId: config.existingRunId, resourceBundleId: config.resourceBundleId },
      );

      return {
        ok: true,
        output: result,
        costMinor: result.costMinor,
        logs: [
          {
            level: "info",
            message: `Director swarm completed: status=${result.status} workers=${result.workerCount} cost=${result.costMinor}`,
          },
        ],
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "SWARM_FAILED",
          message: error instanceof Error ? error.message : "Director swarm failed",
        },
        logs: [{ level: "error", message: "Director swarm failed", data: String(error) }],
      };
    }
  }
}
