/**
 * Request/response types and Zod schemas. Response schemas mirror the Swarms
 * Cloud control-plane API so the SDK validates what it receives and fails loudly
 * if the server contract drifts.
 */

import { z } from "zod";

/* ----------------------------- requests ----------------------------- */

/** Resources the parent agent hands to the spawned worker (it inherits these). */
export interface SpawnResources {
  /** Environment variables / secrets the worker needs. */
  env?: Record<string, string>;
  /** Files for the worker's workspace (path -> contents). */
  files?: Record<string, string>;
  /** MCP servers (inherited tool access). */
  mcpServers?: Array<{ name: string; url: string; token?: string }>;
  /** Background/context so the worker isn't starting blind. */
  context?: string;
}

export interface SpawnAgentParams {
  /** What the worker agent should do. */
  task: string;
  resources?: SpawnResources;
  model?: string;
  /** Hard budget ceiling in minor units (caps GPU time). */
  budgetMinor?: number;
  currency?: string;
  idempotencyKey: string;
  callbackUrl?: string;
}

export interface SpawnSwarmParams {
  /** One worker agent is spawned per task. */
  tasks: string[];
  /** Optional shared objective given to every worker as context. */
  objective?: string;
  /** Resources inherited by EVERY worker. */
  resources?: SpawnResources;
  model?: string;
  /** Hard aggregate ceiling across the whole swarm, in minor units. */
  budgetMinor?: number;
  currency?: string;
  idempotencyKey: string;
}

/* ----------------------------- responses ---------------------------- */

export const spawnResponseSchema = z.object({
  jobId: z.string(),
  status: z.string(),
  model: z.string(),
  maxGpuSeconds: z.number(),
  estimatedCostMinor: z.number(),
  currency: z.string(),
  resources: z.object({
    envKeys: z.array(z.string()),
    fileCount: z.number(),
    mcpServers: z.array(z.string()),
    hasContext: z.boolean(),
  }),
  executionUrl: z.string(),
  createdAt: z.string(),
});
export type SpawnResponse = z.infer<typeof spawnResponseSchema>;

export const jobSchema = z.object({
  id: z.string(),
  status: z.string(),
  capabilityKind: z.string(),
  skillVersionId: z.string().nullable(),
  input: z.unknown(),
  output: z.unknown(),
  error: z.unknown(),
  costMinor: z.number(),
  costCurrency: z.string(),
  createdAt: z.string(),
  queuedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

export const jobLogSchema = z.object({
  level: z.string(),
  message: z.string(),
  data: z.unknown(),
  loggedAt: z.string(),
});
export type JobLog = z.infer<typeof jobLogSchema>;

export const swarmRunSchema = z.object({
  id: z.string(),
  status: z.string(),
  objective: z.string(),
  costMinor: z.number(),
  costCurrency: z.string(),
  output: z.unknown(),
  agents: z.array(
    z.object({
      role: z.string(),
      status: z.string(),
      jobId: z.string().nullable(),
      costMinor: z.number(),
      output: z.unknown(),
      error: z.unknown(),
    }),
  ),
  createdAt: z.string(),
});
export type SwarmRun = z.infer<typeof swarmRunSchema>;

export const swarmSpawnResponseSchema = z.object({
  swarmRunId: z.string(),
  status: z.string(),
  workerCount: z.number(),
  costMinor: z.number(),
  currency: z.string(),
  maxGpuSecondsPerWorker: z.number(),
  workers: z.array(
    z.object({
      role: z.string(),
      status: z.string(),
      jobId: z.string().nullable(),
      costMinor: z.number(),
      output: z.unknown(),
      error: z.unknown(),
    }),
  ),
  createdAt: z.string(),
});
export type SwarmSpawnResponse = z.infer<typeof swarmSpawnResponseSchema>;
