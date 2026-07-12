/**
 * Simulation runtime — runs a whole CrewAI crew inside ONE sandbox and returns
 * the crew output, a transcript, per-persona results, and metered GPU seconds.
 *
 * Two implementations behind one port:
 *  - MockSimulationRuntime: deterministic, no network/keys — the dev/test default
 *    and the fallback whenever AGENT_RUNTIME is not `modal`.
 *  - ModalSimulationRuntime: POSTs the crew spec to the deployed `/simulate`
 *    endpoint (infra/modal/agent_worker.py), which builds the CrewAI crew,
 *    wires OpenRouter + the environment tools, runs it bounded by maxRounds +
 *    a wall-clock deadline, and returns the result. Bounded timeout, exponential
 *    backoff, and every failure mapped to the typed result shape (never throws).
 *
 * The transport is injectable so this is unit-testable without Modal or network.
 */

import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ResourceBundle } from "@/modules/resources/resource-bundle";
import type { Persona, ResolvedSimulationConfig } from "@/modules/simulations/schema";

export interface SimulationRunInput {
  simulationRunId: string;
  organizationId: string;
  config: ResolvedSimulationConfig;
  /** Decrypted inherited resources (server-side only; injected into the sandbox). */
  resources: ResourceBundle;
  maxRuntimeMs: number;
  /** Hard cap on billable GPU seconds (derived from the budget). */
  maxGpuSeconds: number;
}

export interface PersonaResult {
  personaName: string;
  role?: string;
  status: "succeeded" | "failed";
  output?: unknown;
  error?: { code: string; message: string };
}

export interface SimulationLog {
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export type SimulationRunResult =
  | {
      ok: true;
      output: unknown;
      transcript?: unknown;
      byPersona: PersonaResult[];
      aggregatorOutput?: unknown;
      gpuSeconds: number;
      logs: SimulationLog[];
    }
  | { ok: false; error: { code: string; message: string }; gpuSeconds: number; logs: SimulationLog[] };

export interface SimulationRuntime {
  readonly kind: string;
  run(input: SimulationRunInput): Promise<SimulationRunResult>;
}

// ── Mock runtime ────────────────────────────────────────────────────────────

/**
 * Deterministic simulation runtime for dev/test. Produces a plausible per-persona
 * result and a small transcript without any network or model calls, and reports a
 * bounded GPU-second figure so cost math is exercised end-to-end.
 */
export class MockSimulationRuntime implements SimulationRuntime {
  readonly kind = "mock";

  async run(input: SimulationRunInput): Promise<SimulationRunResult> {
    const { config } = input;
    const byPersona: PersonaResult[] = config.agents.map((p: Persona) => ({
      personaName: p.name,
      role: p.role,
      status: "succeeded",
      output: {
        summary: `[[mock ${config.mode}]] ${p.name} responded to "${config.objective ?? p.objective ?? p.task ?? "the task"}"`,
        reasoning: "mock deterministic reasoning",
      },
    }));

    const transcript =
      config.mode === "collaborative"
        ? config.agents.map((p, i) => ({ round: 1, turn: i + 1, persona: p.name, message: `mock turn from ${p.name}` }))
        : undefined;

    // Bounded, deterministic GPU-seconds: proportional to crew size, clamped to
    // the caller's cap so the mock never "bills" past the reservation.
    const rawSeconds = Math.max(1, config.agents.length * 2);
    const gpuSeconds = Math.min(rawSeconds, Math.max(input.maxGpuSeconds, 1));

    return {
      ok: true,
      output: {
        mode: config.mode,
        findings: `Mock synthesis across ${config.agents.length} personas.`,
        byPersona: byPersona.map((r) => ({ persona: r.personaName, output: r.output })),
      },
      transcript,
      byPersona,
      aggregatorOutput: config.aggregatorTask ? { summary: "mock aggregated findings" } : undefined,
      gpuSeconds,
      logs: [{ level: "info", message: `mock simulation completed (${config.agents.length} personas, ${config.mode})` }],
    };
  }
}

// ── Modal runtime ───────────────────────────────────────────────────────────

const personaResultSchema = z.object({
  personaName: z.string(),
  role: z.string().optional(),
  status: z.enum(["succeeded", "failed"]),
  output: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

const responseSchema = z.object({
  output: z.unknown(),
  transcript: z.unknown().optional(),
  byPersona: z.array(personaResultSchema).default([]),
  aggregatorOutput: z.unknown().optional(),
  gpuSeconds: z.number().nonnegative(),
  logs: z
    .array(z.object({ level: z.enum(["debug", "info", "warn", "error"]), message: z.string() }))
    .optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export type SimulationFetch = typeof fetch;

export interface ModalSimulationConfig {
  simulateUrl: string;
  token: string;
}

const TIMEOUT_MS = 900_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 1_000, 4_000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ModalSimulationRuntime implements SimulationRuntime {
  readonly kind = "modal";

  constructor(
    private readonly cfg: ModalSimulationConfig,
    private readonly fetchImpl: SimulationFetch = fetch,
  ) {}

  async run(input: SimulationRunInput): Promise<SimulationRunResult> {
    const start = Date.now();
    const body = JSON.stringify({
      simulationRunId: input.simulationRunId,
      organizationId: input.organizationId,
      mode: input.config.mode,
      objective: input.config.objective,
      model: input.config.model,
      agents: input.config.agents,
      scenario: input.config.scenario,
      aggregatorTask: input.config.aggregatorTask,
      maxGpuSeconds: input.maxGpuSeconds,
      maxRuntimeMs: input.maxRuntimeMs,
      resources: input.resources,
    });

    // One total-wall deadline across retries (mirrors modalAgentRuntime): keep
    // the sum under the caller's runtime budget so a healthy long run is not
    // reaped mid-flight and re-executed.
    const deadline = start + Math.min(TIMEOUT_MS, input.maxRuntimeMs + 10_000);
    let lastMessage = "Modal simulate call failed";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await delay(BACKOFF_MS[attempt] ?? 4_000);
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return this.fail("TIMEOUT", "Modal simulate exceeded total time budget", start);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remainingMs);
      try {
        const res = await this.fetchImpl(this.cfg.simulateUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.cfg.token}`,
          },
          body,
          signal: controller.signal,
        });

        if (!res.ok) {
          lastMessage = `Modal simulate returned ${res.status}`;
          if (res.status < 500) return this.fail("UPSTREAM_ERROR", lastMessage, start);
          continue; // retry transient 5xx
        }

        const json = await res.json().catch(() => null);
        const parsed = responseSchema.safeParse(json);
        if (!parsed.success) return this.fail("UPSTREAM_ERROR", "Malformed Modal simulate response", start);
        if (parsed.data.error) return this.fail(parsed.data.error.code, parsed.data.error.message, start);

        // Never bill past the caller's cap even if the sandbox over-reports.
        const gpuSeconds = Math.min(
          Math.max(1, Math.ceil(parsed.data.gpuSeconds)),
          Math.max(input.maxGpuSeconds, 1),
        );
        return {
          ok: true,
          output: parsed.data.output,
          transcript: parsed.data.transcript,
          byPersona: parsed.data.byPersona,
          aggregatorOutput: parsed.data.aggregatorOutput,
          gpuSeconds,
          logs: parsed.data.logs ?? [{ level: "info", message: "simulation completed via Modal" }],
        };
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        lastMessage = aborted ? "Modal simulate timed out" : "Modal simulate failed";
        if (aborted) return this.fail("TIMEOUT", lastMessage, start);
      } finally {
        clearTimeout(timer);
      }
    }
    return this.fail("UPSTREAM_ERROR", lastMessage, start);
  }

  private fail(code: string, message: string, start: number): SimulationRunResult {
    logger.error("modal simulation runtime failed", { code });
    return {
      ok: false,
      gpuSeconds: Math.max(1, Math.round((Date.now() - start) / 1000)),
      error: { code, message },
      logs: [{ level: "error", message }],
    };
  }
}

/**
 * The `/simulate` endpoint URL: explicit MODAL_SIMULATE_URL, else derived from
 * MODAL_RUN_URL by swapping the trailing `/run` for `/simulate` (both are routes
 * on the same deployed Modal app).
 */
export function resolveSimulateUrl(): string | undefined {
  if (env.MODAL_SIMULATE_URL) return env.MODAL_SIMULATE_URL;
  if (env.MODAL_RUN_URL) return env.MODAL_RUN_URL.replace(/\/run(\/?)$/, "/simulate$1");
  return undefined;
}

let runtime: SimulationRuntime | undefined;

export function getSimulationRuntime(): SimulationRuntime {
  if (runtime) return runtime;
  if (env.AGENT_RUNTIME === "modal") {
    const simulateUrl = resolveSimulateUrl();
    if (!simulateUrl || !env.MODAL_TOKEN) {
      throw new Error("AGENT_RUNTIME=modal but MODAL_SIMULATE_URL/MODAL_RUN_URL or MODAL_TOKEN is unset");
    }
    runtime = new ModalSimulationRuntime({ simulateUrl, token: env.MODAL_TOKEN });
    return runtime;
  }
  runtime = new MockSimulationRuntime();
  return runtime;
}

/** Test seam. */
export function setSimulationRuntime(next: SimulationRuntime | undefined): void {
  runtime = next;
}
