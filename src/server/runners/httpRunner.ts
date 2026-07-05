/**
 * HTTP runner. Calls an external capability endpoint declared in the skill
 * version's `runnerConfig.url`. Every external call has a timeout (bounded by
 * the version's `maxRuntimeMs`), structured error handling, and never throws
 * raw — failures are returned as a structured {@link RunnerOutcome}.
 */

import { z } from "zod";

import { assertSafeUrl } from "@/lib/ssrf-guard";
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

    // Defense-in-depth: reject attempts to call private/metadata endpoints via
    // http runner, even though runnerConfig is operator-controlled, not end-user.
    try {
      assertSafeUrl(url, "runnerConfig.url");
    } catch (err) {
      return {
        ok: false,
        error: { code: "CONFIG_ERROR", message: err instanceof Error ? err.message : "Blocked URL" },
        logs: [{ level: "error", message: "http runner blocked by SSRF guard" }],
      };
    }

    const body = JSON.stringify({ input: context.input, jobId: context.jobId });
    // Bounded retry with exponential backoff on transient failures (network
    // error or 5xx). 4xx and timeouts are terminal. The whole retry sequence is
    // bounded by maxRuntimeMs via a shared deadline, so retries never exceed the
    // job's runtime budget.
    const deadline = Date.now() + context.maxRuntimeMs;
    const backoffMs = [0, 300, 900];
    let lastStatus: number | null = null;

    for (let attempt = 0; attempt < backoffMs.length; attempt++) {
      const wait = backoffMs[attempt]!;
      const remainingBefore = deadline - Date.now();
      if (remainingBefore <= 0) break;
      if (wait > 0) {
        if (wait >= remainingBefore) break; // no time left to back off + retry
        await new Promise((r) => setTimeout(r, wait));
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const res = await fetch(url, {
          method,
          headers: { "content-type": "application/json", ...headers },
          body,
          signal: controller.signal,
        });

        if (res.ok) {
          const output: unknown = await res.json().catch(() => ({}));
          return {
            ok: true,
            costMinor: context.priceMinor,
            output,
            logs: [{ level: "info", message: `http runner called ${url} (attempt ${attempt + 1})` }],
          };
        }

        lastStatus = res.status;
        // Retry only transient upstream errors; 4xx is terminal.
        if (res.status < 500 || attempt === backoffMs.length - 1) {
          return {
            ok: false,
            error: { code: "UPSTREAM_ERROR", message: `Capability returned ${res.status}` },
            logs: [{ level: "error", message: `http runner upstream status ${res.status}` }],
          };
        }
        // else: fall through to next attempt
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        if (aborted) {
          return {
            ok: false,
            error: { code: "TIMEOUT", message: "Capability call timed out" },
            logs: [{ level: "error", message: "http runner timed out" }],
          };
        }
        // Network error — retry if attempts + time remain.
        if (attempt === backoffMs.length - 1) {
          return {
            ok: false,
            error: { code: "UPSTREAM_ERROR", message: "Capability call failed" },
            logs: [{ level: "error", message: "http runner error" }],
          };
        }
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      ok: false,
      error: {
        code: "UPSTREAM_ERROR",
        message: lastStatus ? `Capability returned ${lastStatus}` : "Capability call failed within budget",
      },
      logs: [{ level: "error", message: "http runner exhausted retries within runtime budget" }],
    };
  }
}
