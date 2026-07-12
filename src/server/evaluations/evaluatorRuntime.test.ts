import { describe, expect, it } from "vitest";

import { computeOverall, type CriterionScore } from "@/server/evaluations/evaluatorRuntime";
import type { Rubric } from "@/modules/evaluations/schema";

describe("computeOverall", () => {
  const rubric: Rubric = {
    criteria: [{ name: "accuracy", weight: 2 }, { name: "clarity" }],
    threshold: 75,
  };

  it("weights criterion scores into an overall", () => {
    const scores: CriterionScore[] = [
      { criterion: "accuracy", score: 90 },
      { criterion: "clarity", score: 60 },
    ];
    // (2*90 + 1*60) / 3 = 80
    const { overallScore, passed } = computeOverall(scores, rubric);
    expect(overallScore).toBe(80);
    expect(passed).toBe(true);
  });

  it("fails below the threshold", () => {
    const scores: CriterionScore[] = [
      { criterion: "accuracy", score: 60 },
      { criterion: "clarity", score: 60 },
    ];
    expect(computeOverall(scores, rubric).passed).toBe(false);
  });

  it("treats a missing criterion score as 0 and clamps out-of-range", () => {
    const scores: CriterionScore[] = [{ criterion: "accuracy", score: 200 }];
    // accuracy clamps to 100 (weight 2), clarity missing → 0 (weight 1): 200/3 = 67
    expect(computeOverall(scores, rubric).overallScore).toBe(67);
  });

  it("returns null passed when no threshold is set", () => {
    expect(computeOverall([{ criterion: "accuracy", score: 90 }], { criteria: [{ name: "accuracy" }] }).passed).toBeNull();
  });
});
