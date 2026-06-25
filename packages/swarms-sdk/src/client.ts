/**
 * SwarmsClient — the Node-first client that autonomous AI agents and
 * other autonomous agents use to call Swarms. The API key is sent as a
 * Bearer token and is never logged. All responses are validated against the
 * shared Zod schemas.
 */

import { z } from "zod";

import { SwarmsError, SwarmsNetworkError, type SwarmsErrorShape } from "./errors";
import {
  jobLogSchema,
  jobSchema,
  spawnResponseSchema,
  swarmRunSchema,
  swarmSpawnResponseSchema,
  type Job,
  type JobLog,
  type SpawnAgentParams,
  type SpawnResponse,
  type SpawnSwarmParams,
  type SwarmRun,
  type SwarmSpawnResponse,
} from "./types";

type FetchLike = typeof fetch;

export interface SwarmsClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Override the fetch implementation (tests / custom transports). */
  fetch?: FetchLike;
  /** Per-request timeout in ms (default 30s). */
  timeoutMs?: number;
}

export class SwarmsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly doFetch: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: SwarmsClientOptions) {
    if (!options.baseUrl) throw new Error("baseUrl is required");
    if (!options.apiKey) throw new Error("apiKey is required");
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.doFetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /* ------------------------- agent labor ------------------------ */

  /**
   * Spawn a sandboxed worker agent to do a task, handing it the inherited
   * resources (env/secrets, files, MCP tools, context). The budget is a hard
   * GPU-time ceiling — the worker cannot overspend.
   */
  async spawnAgent(params: SpawnAgentParams): Promise<SpawnResponse> {
    return this.request("/api/v1/spawn", {
      method: "POST",
      body: params,
      schema: spawnResponseSchema,
    });
  }

  /**
   * Spawn a workforce: one sandboxed worker agent per task, each inheriting the
   * same resources, all bounded by one aggregate budget (a hard ceiling).
   */
  async spawnSwarm(params: SpawnSwarmParams): Promise<SwarmSpawnResponse> {
    return this.request("/api/v1/swarms", {
      method: "POST",
      body: params,
      schema: swarmSpawnResponseSchema,
    });
  }

  /* ---------------------------- jobs ---------------------------- */

  async getJob(jobId: string): Promise<Job> {
    const data = await this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      schema: z.object({ job: jobSchema }),
    });
    return data.job;
  }

  async getJobLogs(jobId: string): Promise<JobLog[]> {
    const data = await this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}/logs`, {
      method: "GET",
      schema: z.object({ logs: z.array(jobLogSchema) }),
    });
    return data.logs;
  }

  async cancelJob(jobId: string): Promise<Job> {
    const data = await this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
      schema: z.object({ job: jobSchema }),
    });
    return data.job;
  }

  /**
   * Placeholder streaming: polls job logs until the job reaches a terminal
   * state. A real server-sent-events / websocket transport will replace this.
   */
  async *streamJobLogs(jobId: string, intervalMs = 1000): AsyncGenerator<JobLog> {
    const seen = new Set<string>();
    for (;;) {
      const [job, logs] = await Promise.all([this.getJob(jobId), this.getJobLogs(jobId)]);
      for (const log of logs) {
        const key = `${log.loggedAt}:${log.message}`;
        if (!seen.has(key)) {
          seen.add(key);
          yield log;
        }
      }
      if (["succeeded", "failed", "cancelled"].includes(job.status)) return;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /* --------------------------- swarms --------------------------- */

  async getSwarmRun(swarmRunId: string): Promise<SwarmRun> {
    const data = await this.request(`/api/v1/swarms/${encodeURIComponent(swarmRunId)}`, {
      method: "GET",
      schema: z.object({ run: swarmRunSchema }),
    });
    return data.run;
  }

  /* --------------------------- internal ------------------------- */

  private async request<T>(
    path: string,
    opts: { method: string; body?: unknown; schema: z.ZodType<T> },
  ): Promise<T> {
    const res = await this.send(`${this.baseUrl}${path}`, {
      method: opts.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new SwarmsError(res.status, (json.error as SwarmsErrorShape) ?? { code: "UNKNOWN", message: "Request failed" });
    }
    return opts.schema.parse(json.data);
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.doFetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      // Never include headers (and therefore the API key) in the error.
      throw new SwarmsNetworkError(`Request to ${url} failed`, error);
    } finally {
      clearTimeout(timer);
    }
  }
}
