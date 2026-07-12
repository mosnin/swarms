/**
 * EvaluationRunner: executes an evaluation director job. Like the simulation
 * director it is a normal poller-claimed, charged job — one judge call in one
 * sandbox, one charge (metered GPU). It claims the evaluation row, runs the
 * evaluator runtime over the content + rubric, computes the weighted overall +
 * pass/fail, and records the result.
 */

import type { Rubric } from "@/modules/evaluations/schema";
import type { Runner, RunnerContext, RunnerOutcome } from "@/server/runners/types";

export interface DirectorEvaluationConfig {
  existingEvaluationId: string;
  content: string;
  rubric: Rubric;
  model: string;
  maxGpuSeconds: number;
  rateMinorPerSecond: number;
  currency: string;
  callbackUrl?: string;
  apiKeyId: string | null;
  createdByUserId: string | null;
}

export class EvaluationRunner implements Runner {
  readonly type = "evaluation" as const;

  async run(context: RunnerContext): Promise<RunnerOutcome> {
    const cfg = context.runnerConfig as DirectorEvaluationConfig;
    if (!cfg.existingEvaluationId || !cfg.rubric) {
      return { ok: false, error: { code: "INVALID_CONFIG", message: "Evaluation config missing id/rubric" }, logs: [] };
    }

    const { getDb } = await import("@/lib/db");
    const schema = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const { getEvaluatorRuntime, computeOverall } = await import("@/server/evaluations/evaluatorRuntime");
    const { fanOutWebhook } = await import("@/modules/webhooks/webhook-service");
    const db = getDb();

    // Best-effort terminal-state webhook: per-request callbackUrl + org endpoints.
    const notify = (status: string, data: Record<string, unknown>) =>
      fanOutWebhook(
        {
          organizationId: context.organizationId,
          eventType: `evaluation.${status}`,
          url: cfg.callbackUrl,
          data: { evaluationId: cfg.existingEvaluationId, status, ...data },
        },
        db,
      ).catch(() => undefined);

    const claimed = (
      await db
        .update(schema.evaluations)
        .set({ status: "running", startedAt: new Date() })
        .where(
          and(
            eq(schema.evaluations.id, cfg.existingEvaluationId),
            eq(schema.evaluations.organizationId, context.organizationId),
            eq(schema.evaluations.status, "queued"),
          ),
        )
        .returning()
    )[0];
    if (!claimed) {
      return { ok: false, error: { code: "CANCELLED", message: "Evaluation not claimable" }, logs: [] };
    }

    const result = await getEvaluatorRuntime().run({
      organizationId: context.organizationId,
      content: cfg.content,
      rubric: cfg.rubric,
      model: cfg.model,
      maxGpuSeconds: cfg.maxGpuSeconds,
      maxRuntimeMs: context.maxRuntimeMs,
    });

    if (!result.ok) {
      await db
        .update(schema.evaluations)
        .set({ status: "failed", finishedAt: new Date() })
        .where(and(eq(schema.evaluations.id, cfg.existingEvaluationId), eq(schema.evaluations.status, "running")));
      await notify("failed", { error: result.error });
      return { ok: false, error: result.error, logs: [{ level: "error", message: `evaluation failed: ${result.error.message}` }] };
    }

    const { overallScore, passed } = computeOverall(result.scores, cfg.rubric);
    const gpuSeconds = Math.min(result.gpuSeconds, Math.max(cfg.maxGpuSeconds, 1));
    const costMinor = gpuSeconds * cfg.rateMinorPerSecond;

    const settled = (
      await db
        .update(schema.evaluations)
        .set({
          status: "succeeded",
          scores: result.scores,
          overallScore,
          passed,
          gpuSeconds,
          costMinor,
          finishedAt: new Date(),
        })
        .where(and(eq(schema.evaluations.id, cfg.existingEvaluationId), eq(schema.evaluations.status, "running")))
        .returning()
    )[0];
    if (!settled) {
      return { ok: false, error: { code: "CANCELLED", message: "Evaluation settled concurrently; charge skipped" }, logs: [] };
    }

    await notify("succeeded", { overallScore, passed, costMinor, currency: cfg.currency });

    return {
      ok: true,
      output: { overallScore, passed, scores: result.scores },
      costMinor,
      logs: [{ level: "info", message: `evaluation scored ${overallScore}/100 (passed=${passed}) gpuSeconds=${gpuSeconds}` }],
    };
  }
}
