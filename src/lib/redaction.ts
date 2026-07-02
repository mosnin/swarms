/**
 * Secret redaction for logs, audit metadata, and diagnostics. Redaction is
 * defensive in depth: it masks values under sensitive keys AND masks values
 * that *look* like credentials (bearer tokens, API keys) regardless of key.
 * Pure and side-effect free so it can be unit-tested and used anywhere.
 */

const SENSITIVE_KEY_RE =
  /(pass(word)?|secret|token|api[_-]?key|authorization|hashed?key|encrypted|credential|private[_-]?key|proof|pepper|cookie)/i;

// Values that look like secrets even under an innocuous key.
const SECRET_VALUE_RES: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-]+/gi,
  /\bhk_[0-9A-Za-z]{40}\b/g, // Swarms API keys (see api-keys.ts API_KEY_PREFIX)
  /\bsk-[A-Za-z0-9]{16,}/g, // generic provider keys
];

export const REDACTED = "[REDACTED]";

/** Mask secret-shaped substrings (bearer tokens, API keys) inside a string. */
export function redactString(value: string): string {
  let out = value;
  for (const re of SECRET_VALUE_RES) out = out.replace(re, REDACTED);
  return out;
}

/**
 * Recursively redact a value. Objects keyed by a sensitive name have their value
 * fully masked; strings elsewhere have embedded secrets masked. Cyclic
 * references are handled.
 */
export function redact<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (value === null || typeof value !== "object") return value;

  if (seen.has(value as object)) return "[Circular]" as unknown as T;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? REDACTED : redact(val, seen);
  }
  return out as unknown as T;
}
