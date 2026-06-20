/**
 * Lightweight structural validation of job input against a skill's declared
 * JSON-Schema `inputSchema`. This is intentionally a focused subset of JSON
 * Schema (type, required, top-level property types) — enough to reject clearly
 * malformed input at the control-plane boundary with a clear, structured error.
 * Full schema compilation/coercion is the worker's responsibility at runtime.
 */

import { Errors } from "@/lib/errors";

type JsonSchema = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  object: isPlainObject,
  array: (v) => Array.isArray(v),
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  null: (v) => v === null,
};

function matchesType(value: unknown, type: string): boolean {
  const check = TYPE_CHECKS[type];
  return check ? check(value) : true; // unknown types are not enforced
}

/**
 * Collect human-readable validation issues for `input` against `schema`.
 * Returns an empty array when the input structurally satisfies the schema.
 */
export function collectInputIssues(input: unknown, schema: unknown): string[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const s = schema as JsonSchema;
  const issues: string[] = [];

  if (typeof s.type === "string" && !matchesType(input, s.type)) {
    issues.push(`input must be of type ${s.type}`);
    return issues; // further checks assume the top-level type matched
  }

  if (s.type === "object" || (s.type === undefined && isPlainObject(input))) {
    const obj = (input ?? {}) as Record<string, unknown>;
    const required = Array.isArray(s.required) ? (s.required as unknown[]) : [];
    for (const key of required) {
      if (typeof key === "string" && !(key in obj)) {
        issues.push(`missing required field: ${key}`);
      }
    }
    const properties = (s.properties ?? {}) as Record<string, JsonSchema>;
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in obj && propSchema && typeof propSchema.type === "string") {
        if (!matchesType(obj[key], propSchema.type)) {
          issues.push(`field "${key}" must be of type ${propSchema.type}`);
        }
      }
    }
  }

  return issues;
}

/** Throw a `VALIDATION` AppError if the input does not satisfy the schema. */
export function assertValidInput(input: unknown, schema: unknown): void {
  const issues = collectInputIssues(input, schema);
  if (issues.length > 0) {
    throw Errors.validation("Input does not match the skill input schema", { issues });
  }
}
