/**
 * SwarmsClient — the Node-first client that autonomous AI agents and
 * other autonomous agents use to call Swarms. The API key is sent as a
 * Bearer token and is never logged. All responses are validated against the
 * shared Zod schemas.
 */

import { z } from "zod";

import { SwarmsError, SwarmsNetworkError, type SwarmsErrorShape } from "./errors";
import {
  agentDetailSchema,
  agentInstanceSchema,
  agentMessagePageSchema,
  agentMessageSchema,
  artifactSchema,
  balanceSchema,
  evaluationResponseSchema,
  evaluationSchema,
  jobLogSchema,
  jobSchema,
  pendingApprovalSchema,
  runExplanationSchema,
  scheduleSchema,
  simulationEstimateSchema,
  simulationResponseSchema,
  simulationRunSchema,
  spawnResponseSchema,
  swarmRunSchema,
  swarmSpawnResponseSchema,
  usageSchema,
  type AgentDetail,
  type AgentInstance,
  type AgentMessage,
  type AgentMessagePage,
  type Artifact,
  type Balance,
  type CreateAgentParams,
  type CreateScheduleParams,
  type EvaluateParams,
  type Evaluation,
  type EvaluationResponse,
  type Job,
  type JobLog,
  type PendingApproval,
  type RunExplanation,
  type Schedule,
  type SimulateParams,
  type SimulationEstimate,
  type SimulationResponse,
  type SimulationRun,
  type SpawnAgentParams,
  type SpawnResponse,
  type SpawnSwarmParams,
  type SwarmRun,
  type SwarmSpawnResponse,
  type UploadArtifactParams,
  type Usage,
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

  /** A plain-English, ledger-true explanation of what a run did and why it cost what it did. */
  async explainRun(jobId: string): Promise<RunExplanation> {
    const data = await this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}/explain`, {
      method: "GET",
      schema: z.object({ explanation: runExplanationSchema }),
    });
    return data.explanation;
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

  async cancelSwarm(swarmRunId: string): Promise<{ swarmRunId: string; status: string }> {
    return this.request(`/api/v1/swarms/${encodeURIComponent(swarmRunId)}/cancel`, {
      method: "POST",
      schema: z.object({ swarmRunId: z.string(), status: z.string() }),
    });
  }

  /** Re-run a past swarm with optional overrides (objective/model/budgetMinor). */
  async replaySwarm(
    swarmRunId: string,
    overrides: { objective?: string; model?: string; budgetMinor?: number; replayTag?: string } = {},
  ): Promise<SwarmSpawnResponse & { replayedFrom: string }> {
    return this.request(`/api/v1/swarms/${encodeURIComponent(swarmRunId)}/replay`, {
      method: "POST",
      body: overrides,
      schema: swarmSpawnResponseSchema.extend({ replayedFrom: z.string() }) as z.ZodType<
        SwarmSpawnResponse & { replayedFrom: string }
      >,
    });
  }

  /** Re-run a past agent job with optional overrides (task/model/budgetMinor). */
  async replayJob(
    jobId: string,
    overrides: { task?: string; model?: string; budgetMinor?: number; replayTag?: string } = {},
  ): Promise<SpawnResponse & { replayedFrom: string }> {
    return this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}/replay`, {
      method: "POST",
      body: overrides,
      schema: spawnResponseSchema.extend({ replayedFrom: z.string() }) as z.ZodType<
        SpawnResponse & { replayedFrom: string }
      >,
    });
  }

  /* ------------------------ hosted agents ----------------------- */

  /**
   * Deploy a persistent hosted agent. It keeps durable memory and wakes on an
   * inbound message or an optional heartbeat; every wake is a metered,
   * budget-capped job.
   */
  async createAgent(params: CreateAgentParams): Promise<AgentInstance> {
    const data = await this.request("/api/v1/agents", {
      method: "POST",
      body: params,
      schema: z.object({ agent: agentInstanceSchema }),
    });
    return data.agent;
  }

  async listAgents(): Promise<AgentInstance[]> {
    const data = await this.request("/api/v1/agents", {
      method: "GET",
      schema: z.object({ agents: z.array(agentInstanceSchema) }),
    });
    return data.agents;
  }

  /** Full detail: the agent, its recent thread, and lifetime spend. */
  async getAgent(agentId: string): Promise<AgentDetail> {
    return this.request(`/api/v1/agents/${encodeURIComponent(agentId)}`, {
      method: "GET",
      schema: agentDetailSchema,
    });
  }

  async pauseAgent(agentId: string): Promise<AgentInstance> {
    const data = await this.request(`/api/v1/agents/${encodeURIComponent(agentId)}/pause`, {
      method: "POST",
      schema: z.object({ agent: agentInstanceSchema }),
    });
    return data.agent;
  }

  async resumeAgent(agentId: string): Promise<AgentInstance> {
    const data = await this.request(`/api/v1/agents/${encodeURIComponent(agentId)}/resume`, {
      method: "POST",
      schema: z.object({ agent: agentInstanceSchema }),
    });
    return data.agent;
  }

  /**
   * Clone an agent's configuration into a new agent with a fresh identity and
   * empty memory. Secrets are not copied. Pass `name` to override the default
   * "(copy)" suffix.
   */
  async cloneAgent(agentId: string, name?: string): Promise<AgentInstance> {
    const data = await this.request(`/api/v1/agents/${encodeURIComponent(agentId)}/clone`, {
      method: "POST",
      body: name !== undefined ? { name } : {},
      schema: z.object({ agent: agentInstanceSchema }),
    });
    return data.agent;
  }

  /** Permanently terminate a hosted agent (no further wakes). */
  async terminateAgent(agentId: string): Promise<{ agentInstanceId: string; status: string }> {
    return this.request(`/api/v1/agents/${encodeURIComponent(agentId)}`, {
      method: "DELETE",
      schema: z.object({ agentInstanceId: z.string(), status: z.string() }),
    });
  }

  /** Deliver an inbound message; the agent wakes to handle it as a charged job. */
  async sendAgentMessage(agentId: string, content: string): Promise<AgentMessage> {
    const data = await this.request(`/api/v1/agents/${encodeURIComponent(agentId)}/messages`, {
      method: "POST",
      body: { content },
      schema: z.object({ message: agentMessageSchema }),
    });
    return data.message;
  }

  /**
   * Page through an agent's message thread, newest first. Pass the returned
   * `nextCursor` to fetch the next (older) page; a null cursor ends the thread.
   */
  async listAgentMessages(
    agentId: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<AgentMessagePage> {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.cursor) params.set("cursor", opts.cursor);
    const qs = params.size > 0 ? `?${params.toString()}` : "";
    return this.request(`/api/v1/agents/${encodeURIComponent(agentId)}/messages${qs}`, {
      method: "GET",
      schema: agentMessagePageSchema,
    });
  }

  /* ------------------------- simulations ------------------------ */

  /** Run a CrewAI crew of personas (parallel or collaborative). Async: poll getSimulation. */
  async simulate(params: SimulateParams): Promise<SimulationResponse> {
    return this.request("/api/v1/simulations", {
      method: "POST",
      body: params,
      schema: simulationResponseSchema,
    });
  }

  /** Dry-run cost preview — no run created, no funds reserved. */
  async estimateSimulation(params: SimulateParams): Promise<SimulationEstimate> {
    return this.request("/api/v1/simulations/estimate", {
      method: "POST",
      body: params,
      schema: simulationEstimateSchema,
    });
  }

  async getSimulation(simulationRunId: string): Promise<SimulationRun> {
    const data = await this.request(`/api/v1/simulations/${encodeURIComponent(simulationRunId)}`, {
      method: "GET",
      schema: z.object({ run: simulationRunSchema }),
    });
    return data.run;
  }

  async cancelSimulation(simulationRunId: string): Promise<{ simulationRunId: string; status: string }> {
    return this.request(`/api/v1/simulations/${encodeURIComponent(simulationRunId)}/cancel`, {
      method: "POST",
      schema: z.object({ simulationRunId: z.string(), status: z.string() }),
    });
  }

  async replaySimulation(
    simulationRunId: string,
    overrides: { objective?: string; model?: string; budgetMinor?: number; maxRounds?: number; replayTag?: string } = {},
  ): Promise<SimulationResponse & { replayedFrom: string }> {
    return this.request(`/api/v1/simulations/${encodeURIComponent(simulationRunId)}/replay`, {
      method: "POST",
      body: overrides,
      schema: simulationResponseSchema.extend({ replayedFrom: z.string() }) as z.ZodType<
        SimulationResponse & { replayedFrom: string }
      >,
    });
  }

  /** The standardized framework catalog (persona packs + scenarios). */
  async listSimulationFrameworks(): Promise<unknown[]> {
    const data = await this.request("/api/v1/simulations/frameworks", {
      method: "GET",
      schema: z.object({ frameworks: z.array(z.unknown()) }),
    });
    return data.frameworks;
  }

  /* -------------------------- schedules ------------------------- */

  /** Cron for agents: run an agent/swarm/simulation on a recurring schedule. */
  async createSchedule(params: CreateScheduleParams): Promise<Schedule> {
    const data = await this.request("/api/v1/schedules", {
      method: "POST",
      body: params,
      schema: z.object({ schedule: scheduleSchema }),
    });
    return data.schedule;
  }

  async listSchedules(): Promise<Schedule[]> {
    const data = await this.request("/api/v1/schedules", {
      method: "GET",
      schema: z.object({ schedules: z.array(scheduleSchema) }),
    });
    return data.schedules;
  }

  async pauseSchedule(scheduleId: string): Promise<Schedule> {
    const data = await this.request(`/api/v1/schedules/${encodeURIComponent(scheduleId)}/pause`, {
      method: "POST",
      schema: z.object({ schedule: scheduleSchema }),
    });
    return data.schedule;
  }

  async resumeSchedule(scheduleId: string): Promise<Schedule> {
    const data = await this.request(`/api/v1/schedules/${encodeURIComponent(scheduleId)}/resume`, {
      method: "POST",
      schema: z.object({ schedule: scheduleSchema }),
    });
    return data.schedule;
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    await this.request(`/api/v1/schedules/${encodeURIComponent(scheduleId)}`, {
      method: "DELETE",
      schema: z.object({ deleted: z.boolean() }),
    });
  }

  /* -------------------------- artifacts ------------------------- */

  /** Upload a file (base64) as an artifact, optionally linked to a run. */
  async uploadArtifact(params: UploadArtifactParams): Promise<Artifact> {
    const data = await this.request("/api/v1/artifacts", {
      method: "POST",
      body: params,
      schema: z.object({ artifact: artifactSchema }),
    });
    return data.artifact;
  }

  async listArtifacts(opts: { jobId?: string; limit?: number } = {}): Promise<Artifact[]> {
    const params = new URLSearchParams();
    if (opts.jobId) params.set("jobId", opts.jobId);
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    const qs = params.size > 0 ? `?${params.toString()}` : "";
    const data = await this.request(`/api/v1/artifacts${qs}`, {
      method: "GET",
      schema: z.object({ artifacts: z.array(artifactSchema) }),
    });
    return data.artifacts;
  }

  /** Download an artifact's bytes (follows the signed redirect when present). */
  async downloadArtifact(artifactId: string): Promise<ArrayBuffer> {
    const res = await this.send(
      `${this.baseUrl}/api/v1/artifacts/${encodeURIComponent(artifactId)}/download`,
      { method: "GET", headers: { authorization: `Bearer ${this.apiKey}` } },
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new SwarmsError(res.status, (json.error as SwarmsErrorShape) ?? { code: "UNKNOWN", message: "Download failed" });
    }
    return res.arrayBuffer();
  }

  /* ------------------------- evaluations ------------------------ */

  /** Score content or a prior run against a weighted rubric (LLM judge). */
  async evaluate(params: EvaluateParams): Promise<EvaluationResponse> {
    return this.request("/api/v1/evaluations", {
      method: "POST",
      body: params,
      schema: evaluationResponseSchema,
    });
  }

  async getEvaluation(evaluationId: string): Promise<Evaluation> {
    const data = await this.request(`/api/v1/evaluations/${encodeURIComponent(evaluationId)}`, {
      method: "GET",
      schema: z.object({ evaluation: evaluationSchema }),
    });
    return data.evaluation;
  }

  async cancelEvaluation(evaluationId: string): Promise<{ evaluationId: string; status: string }> {
    return this.request(`/api/v1/evaluations/${encodeURIComponent(evaluationId)}/cancel`, {
      method: "POST",
      schema: z.object({ evaluationId: z.string(), status: z.string() }),
    });
  }

  /* -------------------- approvals & billing ---------------------- */

  /** Spends held by a require_approval policy, awaiting a human decision. */
  async listApprovals(): Promise<PendingApproval[]> {
    const data = await this.request("/api/v1/approvals", {
      method: "GET",
      schema: z.object({ approvals: z.array(pendingApprovalSchema) }),
    });
    return data.approvals;
  }

  async approve(jobId: string): Promise<{ jobId: string; status: string }> {
    return this.request(`/api/v1/approvals/${encodeURIComponent(jobId)}/approve`, {
      method: "POST",
      schema: z.object({ jobId: z.string(), status: z.string() }),
    });
  }

  async reject(jobId: string, reason?: string): Promise<{ jobId: string; status: string }> {
    return this.request(`/api/v1/approvals/${encodeURIComponent(jobId)}/reject`, {
      method: "POST",
      body: reason !== undefined ? { reason } : {},
      schema: z.object({ jobId: z.string(), status: z.string() }),
    });
  }

  /** Available balance per currency (integer minor units). */
  async getBalances(): Promise<Balance[]> {
    const data = await this.request("/api/v1/billing/balance", {
      method: "GET",
      schema: z.object({ balances: z.array(balanceSchema) }),
    });
    return data.balances;
  }

  /** Spend analytics: total, per-day, burn rate, runway. */
  async getUsage(opts: { sinceDays?: number; currency?: string } = {}): Promise<Usage> {
    const params = new URLSearchParams();
    if (opts.sinceDays !== undefined) params.set("sinceDays", String(opts.sinceDays));
    if (opts.currency) params.set("currency", opts.currency);
    const qs = params.size > 0 ? `?${params.toString()}` : "";
    const data = await this.request(`/api/v1/billing/usage${qs}`, {
      method: "GET",
      schema: z.object({ usage: usageSchema }),
    });
    return data.usage;
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
