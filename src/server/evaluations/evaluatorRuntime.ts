/**
 * Evaluator runtime — an LLM-as-judge that scores content against a rubric.
 *
 *  - MockEvaluatorRuntime: deterministic per-criterion scores, no network/keys —
 *    the dev/test default and the fallback when AGENT_RUNTIME is `mock`.
 *  - LlmEvaluatorRuntime: reuses the agent runtime (so scoring runs isolated in
 *    the same sandbox provider as agents), prompts for a strict JSON rubric
 *    scoring, and parses/clamps the result.
 *
 * The weighted overall + pass/fail computation is a pure, unit-tested function.
 */

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getAgentRuntime } from "@/server/agents/openrouterAgentRuntime";
import type { Criterion, Rubric } from "@/modules/evaluations/schema";

export interface CriterionScore {
  criterion: string;
  score: number; // 0..100
  reasoning?: string;
}

export interface EvaluatorInput {
  organizationId: string;
  content: string;
  rubric: Rubric;
  model: string;
  maxGpuSeconds: number;
  maxRuntimeMs: number;
}

export type EvaluatorResult =
  | { ok: true; scores: CriterionScore[]; gpuSeconds: number }
  | { ok: false; error: { code: string; message: string }; gpuSeconds: number };

export interface EvaluatorRuntime {
  readonly kind: string;
  run(input: EvaluatorInput): Promise<EvaluatorResult>;
}

/** Weighted overall score (0..100) + pass/fail, from per-criterion scores. */
export function computeOverall(
  scores: readonly CriterionScore[],
  rubric: Rubric,
): { overallScore: number; passed: boolean | null } {
  const byName = new Map(scores.map((s) => [s.criterion, s.score]));
  let weightSum = 0;
  let weighted = 0;
  for (const c of rubric.criteria) {
    const w = c.weight ?? 1;
    const s = clampScore(byName.get(c.name) ?? 0);
    weightSum += w;
    weighted += w * s;
  }
  const overallScore = weightSum > 0 ? Math.round(weighted / weightSum) : 0;
  const passed = rubric.threshold !== undefined ? overallScore >= rubric.threshold : null;
  return { overallScore, passed };
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export class MockEvaluatorRuntime implements EvaluatorRuntime {
  readonly kind = "mock";
  async run(input: EvaluatorInput): Promise<EvaluatorResult> {
    // Deterministic: score by criterion-name length so different rubrics differ,
    // but stable across runs. Bounded to [60, 95].
    const scores: CriterionScore[] = input.rubric.criteria.map((c: Criterion) => ({
      criterion: c.name,
      score: 60 + ((c.name.length * 7) % 36),
      reasoning: `[[mock]] scored "${c.name}" deterministically`,
    }));
    const gpuSeconds = Math.min(Math.max(1, input.rubric.criteria.length), Math.max(input.maxGpuSeconds, 1));
    return { ok: true, scores, gpuSeconds };
  }
}

function buildJudgePrompt(content: string, rubric: Rubric): string {
  const criteria = rubric.criteria
    .map((c, i) => `${i + 1}. ${c.name}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");
  return [
    "You are a strict, fair evaluator. Score the CONTENT against each CRITERION from 0 to 100.",
    "Return ONLY a JSON object of the form:",
    '{"scores":[{"criterion":"<name>","score":<0-100>,"reasoning":"<one sentence>"}]}',
    "",
    "CRITERIA:",
    criteria,
    "",
    "CONTENT:",
    content,
  ].join("\n");
}

/** Extract the first JSON object from a possibly-noisy model response. */
function parseScores(text: string, rubric: Rubric): CriterionScore[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const raw = (parsed as { scores?: unknown }).scores;
  if (!Array.isArray(raw)) return null;
  const valid = new Set(rubric.criteria.map((c) => c.name));
  const out: CriterionScore[] = [];
  for (const item of raw) {
    const o = item as { criterion?: unknown; score?: unknown; reasoning?: unknown };
    if (typeof o.criterion === "string" && valid.has(o.criterion) && typeof o.score === "number") {
      out.push({
        criterion: o.criterion,
        score: clampScore(o.score),
        reasoning: typeof o.reasoning === "string" ? o.reasoning.slice(0, 500) : undefined,
      });
    }
  }
  return out.length > 0 ? out : null;
}

export class LlmEvaluatorRuntime implements EvaluatorRuntime {
  readonly kind = "llm";
  async run(input: EvaluatorInput): Promise<EvaluatorResult> {
    try {
      const result = await getAgentRuntime().run({
        jobId: `eval-${input.organizationId}`,
        organizationId: input.organizationId,
        task: buildJudgePrompt(input.content, input.rubric),
        resources: {},
        model: input.model,
        maxRuntimeMs: input.maxRuntimeMs,
      });
      if (!result.ok) return { ok: false, error: result.error, gpuSeconds: result.gpuSeconds };
      const text =
        typeof (result.result as { output?: unknown }).output === "string"
          ? ((result.result as { output: string }).output)
          : JSON.stringify((result.result as { output?: unknown }).output ?? "");
      const scores = parseScores(text, input.rubric);
      if (!scores) {
        return { ok: false, error: { code: "UPSTREAM_ERROR", message: "Judge did not return parseable scores" }, gpuSeconds: result.gpuSeconds };
      }
      return { ok: true, scores, gpuSeconds: Math.min(result.gpuSeconds, Math.max(input.maxGpuSeconds, 1)) };
    } catch (error) {
      logger.error("llm evaluator failed", {});
      return {
        ok: false,
        error: { code: "UPSTREAM_ERROR", message: error instanceof Error ? error.message : "evaluation failed" },
        gpuSeconds: 1,
      };
    }
  }
}

let runtime: EvaluatorRuntime | undefined;

export function getEvaluatorRuntime(): EvaluatorRuntime {
  if (runtime) return runtime;
  runtime = env.AGENT_RUNTIME === "mock" ? new MockEvaluatorRuntime() : new LlmEvaluatorRuntime();
  return runtime;
}

/** Test seam. */
export function setEvaluatorRuntime(next: EvaluatorRuntime | undefined): void {
  runtime = next;
}
