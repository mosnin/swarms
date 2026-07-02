/**
 * Agent runtime abstraction. A spawned worker agent runs a task inside a sandbox
 * with the parent's inherited resources (env/secrets, files, MCP tools, context)
 * available to it, and returns a structured result. Cost is metered in GPU
 * seconds. The runtime runs ONLY in the worker/sandbox — never in a request
 * handler.
 */

import type { ResourceBundle } from "@/modules/resources/resource-bundle";

export interface AgentRunInput {
  jobId: string;
  organizationId: string;
  task: string;
  /** Decrypted, inherited resources (server-side only; injected into sandbox). */
  resources: ResourceBundle;
  model: string;
  maxRuntimeMs: number;
}

export interface AgentLog {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: unknown;
}

export type AgentRunResult =
  | { ok: true; result: unknown; gpuSeconds: number; logs: AgentLog[] }
  | { ok: false; error: { code: string; message: string }; gpuSeconds: number; logs: AgentLog[] };

export interface AgentRuntime {
  readonly kind: string;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
