/**
 * API key cryptographic helpers. Keys are high-entropy random tokens, so a fast
 * one-way hash (SHA-256, optionally HMAC-peppered) is appropriate — we never
 * need to reverse them and never store them in plaintext. Only a short,
 * non-secret prefix is retained for display and lookup.
 *
 * Key shape: `hk_<40 base62 chars>`. The visible prefix is the first 11 chars
 * (`hk_` + 8), shown to the user once at creation and stored for identification.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { randomBase62 } from "@/lib/ids";

export const API_KEY_PREFIX = "hk_";
const SECRET_LENGTH = 40;
/** Number of leading characters retained as the non-secret, displayable prefix. */
export const VISIBLE_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export interface GeneratedApiKey {
  /** Full plaintext key — returned to the caller exactly once, never stored. */
  plaintext: string;
  /** Non-secret display prefix, e.g. `hk_Ab12Cd34`. Safe to persist/show. */
  prefix: string;
  /** One-way hash to persist. The plaintext is unrecoverable from this. */
  hashedKey: string;
}

/** Hash a raw key. Uses HMAC-SHA256 when a pepper is supplied, else SHA-256. */
export function hashApiKey(raw: string, pepper?: string): string {
  if (pepper) {
    return createHmac("sha256", pepper).update(raw).digest("hex");
  }
  return createHash("sha256").update(raw).digest("hex");
}

/** Generate a fresh key + its persistable prefix/hash. */
export function generateApiKey(pepper?: string): GeneratedApiKey {
  const plaintext = `${API_KEY_PREFIX}${randomBase62(SECRET_LENGTH)}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, VISIBLE_PREFIX_LENGTH),
    hashedKey: hashApiKey(plaintext, pepper),
  };
}

/** Whether a string is shaped like one of our API keys. */
export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX) && value.length === API_KEY_PREFIX.length + SECRET_LENGTH;
}

/** Constant-time comparison of two hex hashes. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Verify a presented raw key against a stored hash (constant time). */
export function verifyApiKey(raw: string, storedHash: string, pepper?: string): boolean {
  return hashesEqual(hashApiKey(raw, pepper), storedHash);
}

/** Extract the displayable prefix from a raw key. */
export function prefixOf(raw: string): string {
  return raw.slice(0, VISIBLE_PREFIX_LENGTH);
}
