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

/* ------------------------- simulations ------------------------- */

export interface Persona {
  name: string;
  role?: string;
  objective?: string;
  attributes?: Record<string, unknown>;
  model?: string;
  task?: string;
}

export interface SimulateParams {
  mode: "parallel" | "collaborative";
  frameworkId?: string;
  objective?: string;
  agents: Persona[];
  model?: string;
  resources?: SpawnResources;
  scenario?: {
    environment?: { kind: "mcp"; url: string; token?: string } | { kind: "dataset"; data: unknown } | { kind: "none" };
    process?: "sequential" | "hierarchical";
    managerModel?: string;
    maxRounds?: number;
    successCriteria?: string;
  };
  aggregatorTask?: string;
  budgetMinor?: number;
  budgetUsd?: number;
  currency?: string;
  idempotencyKey?: string;
  callbackUrl?: string;
}

export const simulationResponseSchema = z.object({
  simulationRunId: z.string(),
  status: z.string(),
  mode: z.string(),
  agentCount: z.number(),
  costMinor: z.number(),
  baseFeeMinor: z.number(),
  currency: z.string(),
  maxGpuSeconds: z.number(),
  estimatedCostMinor: z.number(),
  createdAt: z.string(),
});
export type SimulationResponse = z.infer<typeof simulationResponseSchema>;

export const simulationRunSchema = z.object({
  id: z.string(),
  status: z.string(),
  mode: z.string(),
  objective: z.string(),
  costMinor: z.number(),
  baseFeeMinor: z.number(),
  gpuSeconds: z.number(),
  costCurrency: z.string(),
  output: z.unknown(),
  agents: z.array(
    z.object({
      personaName: z.string(),
      role: z.string().nullable(),
      status: z.string(),
      output: z.unknown(),
      error: z.unknown(),
    }),
  ),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type SimulationRun = z.infer<typeof simulationRunSchema>;

export const simulationEstimateSchema = z.object({
  mode: z.string(),
  agents: z.number(),
  baseMinor: z.number(),
  rateMinorPerSecond: z.number(),
  estimatedGpuSeconds: z.number(),
  maxGpuSeconds: z.number(),
  estimatedCostMinor: z.number(),
  reservedMinor: z.number(),
  currency: z.string(),
  withinBudget: z.boolean(),
  rejectionReason: z.string().optional(),
});
export type SimulationEstimate = z.infer<typeof simulationEstimateSchema>;

/* -------------------------- schedules -------------------------- */

export interface CreateScheduleParams {
  name: string;
  kind: "agent" | "swarm" | "simulation";
  cronExpression: string;
  timezone?: string;
  request: Record<string, unknown>;
}

export const scheduleSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  cronExpression: z.string(),
  timezone: z.string(),
  status: z.string(),
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastRunRef: z.string().nullable(),
  lastError: z.string().nullable(),
  runCount: z.number(),
  createdAt: z.string(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

/* -------------------------- artifacts -------------------------- */

export const artifactSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  sha256: z.string(),
  jobId: z.string().nullable(),
  swarmRunId: z.string().nullable(),
  simulationRunId: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Artifact = z.infer<typeof artifactSchema>;

export interface UploadArtifactParams {
  filename: string;
  contentType?: string;
  /** Base64-encoded file bytes. */
  contentBase64: string;
  jobId?: string;
  swarmRunId?: string;
  simulationRunId?: string;
}

/* ------------------------- evaluations ------------------------- */

export interface EvaluateParams {
  subjectType?: "text" | "job" | "swarm" | "simulation";
  subjectId?: string;
  content?: string;
  rubric: {
    criteria: Array<{ name: string; description?: string; weight?: number }>;
    threshold?: number;
  };
  model?: string;
  budgetMinor?: number;
  budgetUsd?: number;
  currency?: string;
  idempotencyKey?: string;
  callbackUrl?: string;
}

export const evaluationSchema = z.object({
  id: z.string(),
  status: z.string(),
  subjectType: z.string(),
  subjectId: z.string().nullable(),
  rubric: z.unknown(),
  scores: z.unknown(),
  overallScore: z.number().nullable(),
  passed: z.boolean().nullable(),
  costMinor: z.number(),
  costCurrency: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type Evaluation = z.infer<typeof evaluationSchema>;

export const evaluationResponseSchema = z.object({
  evaluationId: z.string(),
  status: z.string(),
  subjectType: z.string(),
  overallScore: z.number().nullable(),
  passed: z.boolean().nullable(),
  costMinor: z.number(),
  currency: z.string(),
  estimatedCostMinor: z.number(),
  createdAt: z.string(),
});
export type EvaluationResponse = z.infer<typeof evaluationResponseSchema>;

/* -------------------- approvals & billing ---------------------- */

export const pendingApprovalSchema = z.object({
  jobId: z.string(),
  capabilityKind: z.string(),
  task: z.string().nullable(),
  estimatedCostMinor: z.number(),
  currency: z.string(),
  runId: z.string().nullable(),
  createdAt: z.string(),
});
export type PendingApproval = z.infer<typeof pendingApprovalSchema>;

export const balanceSchema = z.object({ currency: z.string(), balanceMinor: z.number() });
export type Balance = z.infer<typeof balanceSchema>;

export const usageSchema = z.object({
  currency: z.string(),
  sinceDays: z.number(),
  totalSpentMinor: z.number(),
  dailyBurnMinor: z.number(),
  balanceMinor: z.number(),
  runwayDays: z.number().nullable(),
  byDay: z.array(z.object({ date: z.string(), spentMinor: z.number(), runs: z.number() })),
});
export type Usage = z.infer<typeof usageSchema>;
