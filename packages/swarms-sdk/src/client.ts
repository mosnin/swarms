/**
 * SwarmsClient — the Node-first client that autonomous AI agents and
 * other autonomous agents use to call Swarms. The API key is sent as a
 * Bearer token and is never logged. All responses are validated against the
 * shared Zod schemas.
 */

import { z } from "zod";

import { SwarmsError, SwarmsNetworkError, type SwarmsErrorShape } from "./errors";
import {
  executeResponseSchema,
  jobLogSchema,
  jobSchema,
  paymentRequirementsSchema,
  spawnResponseSchema,
  swarmRunSchema,
  type ExecutePaidResult,
  type ExecuteSkillParams,
  type Job,
  type JobLog,
  type PaymentSigner,
  type RunSwarmParams,
  type SpawnAgentParams,
  type SpawnResponse,
  type SwarmRun,
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
   * Paid execution. With no signer (or when payment is required) the server's
   * x402 requirements are returned. With a signer, the requirements are signed
   * and the call is retried with the `X-PAYMENT` header.
   */
  async executePaidSkill(
    params: ExecuteSkillParams,
    options: { signer?: PaymentSigner } = {},
  ): Promise<ExecutePaidResult> {
    const first = await this.rawExecutePaid(params);
    if (first.kind === "ok" || !options.signer) return first;

    const header = await options.signer.sign(first.requirements);
    const retried = await this.rawExecutePaid(params, header);
    return retried;
  }

  private async rawExecutePaid(
    params: ExecuteSkillParams,
    paymentHeader?: string,
  ): Promise<ExecutePaidResult> {
    const url = `${this.baseUrl}/api/v1/execute-paid`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
    };
    if (paymentHeader) headers["x-payment"] = paymentHeader;

    const res = await this.send(url, { method: "POST", headers, body: JSON.stringify(params) });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.status === 402) {
      const accepts = (json.accepts as unknown[]) ?? [];
      const requirements = paymentRequirementsSchema.parse(accepts[0]);
      return { kind: "payment_required", requirements };
    }
    if (!res.ok) throw new SwarmsError(res.status, (json.error as SwarmsErrorShape) ?? { code: "UNKNOWN", message: "error" });
    return { kind: "ok", response: executeResponseSchema.parse(json.data) };
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

  async runSwarm(params: RunSwarmParams): Promise<SwarmRun> {
    const data = await this.request("/api/v1/swarms/run", {
      method: "POST",
      body: params,
      schema: z.object({ run: swarmRunSchema }),
    });
    return data.run;
  }

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
