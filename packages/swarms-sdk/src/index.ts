/**
 * @swarms/sdk — TypeScript client for Swarms, the paid execution
 * layer that autonomous AI agents call
 * to rent skills, connectors, and sandboxed worker swarms.
 */

export { SwarmsClient, type SwarmsClientOptions } from "./client";
export { SwarmsError, SwarmsNetworkError, type SwarmsErrorShape } from "./errors";
export { generateIdempotencyKey, toMinorUnits, budget } from "./idempotency";
export type {
  SpawnAgentParams,
  SpawnResources,
  SpawnResponse,
  ExecuteSkillParams,
  RunSwarmParams,
  ExecuteResponse,
  ExecutePaidResult,
  Job,
  JobLog,
  SwarmRun,
  PaymentRequirements,
  PaymentSigner,
} from "./types";
