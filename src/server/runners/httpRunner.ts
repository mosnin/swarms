/**
 * HTTP runner. Calls an external capability endpoint declared in the skill
 * version's `runnerConfig.url`. Every external call has a timeout (bounded by
 * the version's `maxRuntimeMs`), structured error handling, and never throws
 * raw — failures are returned as a structured {@link RunnerOutcome}.
 */

import { z } from "zod";

import type { Runner, RunnerContext, RunnerOutcome } from "@/server/runners/types";

const configSchema = z.object({
  url: z.string().url(),
  method: z.enum(["POST", "PUT"]).default("POST"),
  headers: z.record(z.string(), z.string()).optional(),
});

export class HttpRunner implements Runner {
  readonly type = "http" as const;

  async run(context: RunnerContext): Promise<RunnerOutcome> {
    const parsed = configSchema.safeParse(context.runnerConfig);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: "CONFIG_ERROR", message: "Invalid http runner config" },
        logs: [{ level: "error", message: "http runner config failed validation" }],
      };
    }

    const { url, method, headers } = parsed.data;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.maxRuntimeMs);

    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ input: context.input, jobId: context.jobId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return {
          ok: false,
          error: { code: "UPSTREAM_ERROR", message: `Capability returned ${res.status}` },
          logs: [{ level: "error", message: `http runner upstream status ${res.status}` }],
        };
      }

      const output: unknown = await res.json().catch(() => ({}));
      return {
        ok: true,
        costMinor: context.priceMinor,
        output,
        logs: [{ level: "info", message: `http runner called ${url}` }],
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        ok: false,
        error: {
          code: aborted ? "TIMEOUT" : "UPSTREAM_ERROR",
          message: aborted ? "Capability call timed out" : "Capability call failed",
        },
        logs: [{ level: "error", message: aborted ? "http runner timed out" : "http runner error" }],
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
