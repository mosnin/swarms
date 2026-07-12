/** Evaluation request schema — the boundary between untrusted input and the judge. */

import { z } from "zod";

export const MAX_CRITERIA = 20;

export const criterionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1_000).optional(),
  /** Relative weight in the overall score (default 1). */
  weight: z.number().positive().max(100).optional(),
});

export type Criterion = z.infer<typeof criterionSchema>;

export const rubricSchema = z.object({
  criteria: z.array(criterionSchema).min(1).max(MAX_CRITERIA),
  /** Pass threshold for the weighted overall score (0..100). */
  threshold: z.number().int().min(0).max(100).optional(),
});

export type Rubric = z.infer<typeof rubricSchema>;

export const evaluationConfigSchema = z
  .object({
    // What to judge: inline text, or the output of a prior run.
    subjectType: z.enum(["text", "job", "swarm", "simulation"]).default("text"),
    subjectId: z.string().max(255).optional(),
    content: z.string().max(200_000).optional(),
    rubric: rubricSchema,
    model: z.string().max(96).optional(),

    budgetMinor: z.number().int().nonnegative().optional(),
    budgetUsd: z.number().positive().optional(),
    currency: z
      .string()
      .length(3)
      .transform((c) => c.toUpperCase())
      .optional(),
    idempotencyKey: z.string().min(1).max(255).optional(),
    callbackUrl: z.string().url().optional(),
    organizationId: z.string().optional(),
  })
  .refine((d) => d.subjectType === "text" ? typeof d.content === "string" && d.content.length > 0 : Boolean(d.subjectId), {
    message: "Provide `content` for subjectType=text, or `subjectId` for a run reference",
    path: ["content"],
  })
  .refine((d) => !(d.budgetUsd !== undefined && d.budgetMinor !== undefined), {
    message: "Provide budgetUsd or budgetMinor, not both",
    path: ["budgetUsd"],
  });

export type EvaluationConfigInput = z.infer<typeof evaluationConfigSchema>;
