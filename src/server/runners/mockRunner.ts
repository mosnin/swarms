/**
 * Mock runner. Returns deterministic demo output derived from the input so the
 * full execution loop (queue → worker → result → ledger → receipt) can be
 * exercised end-to-end without any external dependency. Always charges the
 * capability's declared price on success.
 */

import type { Runner, RunnerContext, RunnerOutcome } from "@/server/runners/types";

export class MockRunner implements Runner {
  readonly type = "mock" as const;

  async run(context: RunnerContext): Promise<RunnerOutcome> {
    return {
      ok: true,
      costMinor: context.priceMinor,
      output: {
        echo: context.input,
        skillVersionId: context.skillVersionId,
        producedBy: "mock-runner",
        deterministic: true,
      },
      logs: [
        { level: "info", message: "Mock runner started" },
        { level: "info", message: "Mock runner produced deterministic output" },
      ],
    };
  }
}
