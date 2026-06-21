/**
 * Modal compute runtime — the one production provider. It runs the SAME OpenAI
 * Agents SDK harness as the local runtime, but inside a Modal sandbox: the
 * control plane POSTs the run spec (task, model, inherited resources) to a
 * deployed Modal web endpoint, which executes the agent loop (building the
 * inherited files/MCP servers into real callable tools) and returns the result
 * plus metered compute seconds.
 *
 * This keeps the trust boundary real — the worker and its secret-touching tool
 * calls run in Modal's isolated container, never in the Next.js process. The
 * HTTP call has a bounded timeout, exponential-backoff retries, and maps every
 * failure to the typed result shape (never throws). The transport is injectable
 * so the runtime is unit-testable without Modal or network.
 */

import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { AgentRunInput, AgentRunResult, AgentRuntime } from "@/server/agents/types";

const responseSchema = z.object({
  output: z.unknown(),
  gpuSeconds: z.number().nonnegative(),
  logs: z
    .array(z.object({ level: z.enum(["debug", "info", "warn", "error"]), message: z.string() }))
    .optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export type ModalFetch = typeof fetch;

export interface ModalConfig {
  runUrl: string;
  token: string;
}

const TIMEOUT_MS = 600_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 1_000, 4_000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ModalAgentRuntime implements AgentRuntime {
  readonly kind = "modal";

  constructor(
    private readonly cfg: ModalConfig,
    private readonly fetchImpl: ModalFetch = fetch,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const start = Date.now();
    const body = JSON.stringify({
      jobId: input.jobId,
      organizationId: input.organizationId,
      task: input.task,
      model: input.model,
      maxRuntimeMs: input.maxRuntimeMs,
      resources: input.resources,
    });

    let lastMessage = "Modal call failed";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await delay(BACKOFF_MS[attempt] ?? 4_000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(TIMEOUT_MS, input.maxRuntimeMs + 10_000));
      try {
        const res = await this.fetchImpl(this.cfg.runUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.cfg.token}`,
          },
          body,
          signal: controller.signal,
        });

        if (!res.ok) {
          lastMessage = `Modal returned ${res.status}`;
          if (res.status < 500) return this.fail("UPSTREAM_ERROR", lastMessage, start);
          continue; // retry transient 5xx
        }

        const json = await res.json().catch(() => null);
        const parsed = responseSchema.safeParse(json);
        if (!parsed.success) return this.fail("UPSTREAM_ERROR", "Malformed Modal response", start);
        if (parsed.data.error) return this.fail(parsed.data.error.code, parsed.data.error.message, start);

        return {
          ok: true,
          gpuSeconds: Math.max(1, Math.ceil(parsed.data.gpuSeconds)),
          result: { model: input.model, output: parsed.data.output, provider: "modal" },
          logs: parsed.data.logs ?? [
            { level: "info", message: `agent completed on ${input.model} via Modal` },
          ],
        };
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        lastMessage = aborted ? "Modal call timed out" : "Modal call failed";
        if (aborted) return this.fail("TIMEOUT", lastMessage, start);
      } finally {
        clearTimeout(timer);
      }
    }
    return this.fail("UPSTREAM_ERROR", lastMessage, start);
  }

  private fail(code: string, message: string, start: number): AgentRunResult {
    logger.error("modal agent runtime failed", { code });
    return {
      ok: false,
      gpuSeconds: Math.max(1, Math.round((Date.now() - start) / 1000)),
      error: { code, message },
      logs: [{ level: "error", message }],
    };
  }
}

/** Build the Modal runtime from env, failing closed when it isn't configured. */
export function getModalRuntimeFromEnv(): ModalAgentRuntime {
  if (!env.MODAL_RUN_URL || !env.MODAL_TOKEN) {
    throw new Error("AGENT_RUNTIME=modal but MODAL_RUN_URL/MODAL_TOKEN are unset");
  }
  return new ModalAgentRuntime({ runUrl: env.MODAL_RUN_URL, token: env.MODAL_TOKEN });
}
