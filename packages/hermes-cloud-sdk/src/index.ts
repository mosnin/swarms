/**
 * @hermes-cloud/sdk — TypeScript client for Hermes Cloud, the paid execution
 * layer that the Hermes agent (Nous Research) and other autonomous agents call
 * to rent skills, connectors, and sandboxed worker swarms.
 */

export { HermesCloudClient, type HermesCloudClientOptions } from "./client";
export { HermesCloudError, HermesNetworkError, type HermesErrorShape } from "./errors";
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
