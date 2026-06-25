/**
 * @swarms/sdk — TypeScript client for Swarms, the on-demand execution layer
 * that autonomous AI agents call to spawn sandboxed worker agents that inherit
 * their context, secrets, files, and tools.
 */

export { SwarmsClient, type SwarmsClientOptions } from "./client";
export { SwarmsError, SwarmsNetworkError, type SwarmsErrorShape } from "./errors";
export { generateIdempotencyKey, toMinorUnits, budget } from "./idempotency";
export type {
  SpawnAgentParams,
  SpawnResources,
  SpawnResponse,
  SpawnSwarmParams,
  SwarmSpawnResponse,
  Job,
  JobLog,
  SwarmRun,
} from "./types";
