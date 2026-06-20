/**
 * Skill manifest schema, runner typing, and content checksum. A manifest is the
 * declarative contract a skill version publishes: its I/O schemas, required
 * permissions, risk, and cost/runtime estimates. Manifests are validated with
 * Zod at every boundary (create draft, publish) so malformed capabilities never
 * enter the catalog.
 */

import { createHash } from "node:crypto";
import { z } from "zod";

import { Errors } from "@/lib/errors";

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RUNNER_TYPES = ["mock", "http", "local_worker"] as const;
export type RunnerType = (typeof RUNNER_TYPES)[number];

/** Permissive semver-ish version: `MAJOR.MINOR.PATCH` with optional pre-release. */
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * A JSON Schema document is itself arbitrary JSON. We do not fully validate the
 * meta-schema here; we require a non-null object so it can be stored and later
 * compiled by the worker. Empty objects are allowed (an unconstrained schema).
 */
const jsonSchemaObject = z
  .record(z.unknown())
  .refine((value) => value !== null && !Array.isArray(value), "must be a JSON object");

export const manifestSchema = z
  .object({
    name: z.string().min(1).max(120),
    version: z.string().regex(VERSION_RE, "version must be semver (e.g. 1.2.3)"),
    description: z.string().max(2000).default(""),
    inputSchema: jsonSchemaObject,
    outputSchema: jsonSchemaObject,
    permissions: z.array(z.string().min(1)).default([]),
    riskLevel: z.enum(RISK_LEVELS),
    estimatedCostMinor: z.number().int().nonnegative(),
    estimatedDurationMs: z.number().int().nonnegative(),
    maxRuntimeMs: z.number().int().positive(),
    supportsParallelism: z.boolean(),
  })
  .strict();

export type SkillManifest = z.infer<typeof manifestSchema>;

/**
 * Parse and validate an untrusted manifest. Throws a `VALIDATION` AppError with
 * a flattened issue list on failure (safe to return to the caller).
 */
export function parseManifest(input: unknown): SkillManifest {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) {
    throw Errors.validation("Invalid skill manifest", {
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    });
  }
  return parsed.data;
}

/**
 * Deterministic, order-independent JSON serialization. Object keys are sorted
 * recursively so semantically identical content always produces the same bytes
 * (and therefore the same checksum), regardless of authoring key order.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortValue(v)]));
  }
  return value;
}

export interface ChecksumParts {
  manifest: unknown;
  inputSchema: unknown;
  outputSchema: unknown;
  runnerType: RunnerType;
  runnerConfig?: unknown;
}

/**
 * Content checksum over a version's immutable payload. Two versions with the
 * same content always share a checksum; any byte change yields a new one. Used
 * to detect accidental duplicate publishes and to verify integrity downstream.
 */
export function computeChecksum(parts: ChecksumParts): string {
  const canonical = canonicalize({
    manifest: parts.manifest,
    inputSchema: parts.inputSchema,
    outputSchema: parts.outputSchema,
    runnerType: parts.runnerType,
    runnerConfig: parts.runnerConfig ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
