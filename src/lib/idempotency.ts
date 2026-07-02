/**
 * Idempotency key validation and request fingerprinting helpers. Every paid
 * action must carry a client-supplied idempotency key; replays of the same key
 * with the same request must be safe, and reuse with a *different* request must
 * be rejected as a conflict.
 */

import { createHash } from "node:crypto";

import { Errors } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import { z } from "zod";

export const IDEMPOTENCY_KEY_MIN = 8;
export const IDEMPOTENCY_KEY_MAX = 255;
export const IDEMPOTENCY_HEADER = "idempotency-key";

const KEY_RE = /^[A-Za-z0-9._:-]+$/;

export const idempotencyKeySchema = z
  .string()
  .min(IDEMPOTENCY_KEY_MIN, `Idempotency key must be at least ${IDEMPOTENCY_KEY_MIN} characters`)
  .max(IDEMPOTENCY_KEY_MAX, `Idempotency key must be at most ${IDEMPOTENCY_KEY_MAX} characters`)
  .regex(KEY_RE, "Idempotency key contains invalid characters");

/** A validated idempotency key (nominal type for clarity). */
export type IdempotencyKey = string & { readonly __brand: "IdempotencyKey" };

/** Whether a raw value is a structurally valid idempotency key. */
export function isValidIdempotencyKey(value: unknown): value is string {
  return idempotencyKeySchema.safeParse(value).success;
}

/**
 * Validate and brand an idempotency key, returning a `Result`. On failure the
 * error is a `VALIDATION` {@link AppError}.
 */
export function parseIdempotencyKey(
  value: unknown,
): Result<IdempotencyKey, ReturnType<typeof Errors.validation>> {
  const parsed = idempotencyKeySchema.safeParse(value);
  if (!parsed.success) {
    return err(
      Errors.validation("Invalid idempotency key", {
        issues: parsed.error.issues.map((issue) => issue.message),
      }),
    );
  }
  return ok(parsed.data as IdempotencyKey);
}

/** Extract and validate the key from request headers, or `null` when absent. */
export function idempotencyKeyFromHeaders(headers: Headers): IdempotencyKey | null {
  const raw = headers.get(IDEMPOTENCY_HEADER);
  if (raw === null) return null;
  const parsed = parseIdempotencyKey(raw);
  return parsed.ok ? parsed.value : null;
}

/**
 * Stable JSON serialization with sorted object keys so logically-equal requests
 * hash identically regardless of property order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (val as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return val;
  });
}

/**
 * Deterministic fingerprint of a request payload. Stored alongside the key so a
 * replay with a *different* payload can be detected as a conflict.
 */
export function requestHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/**
 * Derive a stable idempotency key from the caller's organization and the
 * canonical request payload.  Use this when the client did not supply an
 * explicit key — the same org + same payload always produces the same key, so
 * accidental duplicate submissions are still deduplicated.
 *
 * If you genuinely want to run the same logical request twice, supply your own
 * distinct key; auto-derived keys offer best-effort dedup, not per-run isolation.
 */
export function deriveIdempotencyKey(organizationId: string, payload: unknown): string {
  const digest = createHash("sha256")
    .update(organizationId)
    .update("\x00")
    .update(stableStringify(payload))
    .digest("hex")
    .slice(0, 32);
  return `auto-${digest}`;
}

/**
 * Decide the outcome for a key that may already exist. A matching hash is a safe
 * replay; a differing hash is a conflict.
 */
export function reconcileIdempotency(
  incomingHash: string,
  storedHash: string | null,
): Result<"new" | "replay", ReturnType<typeof Errors.idempotencyConflict>> {
  if (storedHash === null) return ok("new");
  if (storedHash === incomingHash) return ok("replay");
  return err(Errors.idempotencyConflict());
}
