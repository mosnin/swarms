/**
 * Signed session tokens for human dashboard access.
 *
 * The session cookie must be tamper-proof: its value binds a `userId` to an
 * expiry under an HMAC-SHA256 signature keyed by the server-only
 * `SESSION_SECRET`. `readSessionRef` verifies the signature (constant-time) and
 * the expiry before trusting the identity, so a raw cookie value can never be
 * used to impersonate a user (see SECURITY_MODEL.md — session integrity).
 *
 * Token format (all URL-safe base64, dot-separated):
 *   <userId>.<expiresAtMs>.<hmac(userId.expiresAtMs)>
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/** Default session lifetime: 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dev-only fallback secret. NEVER used in production — `env.ts` requires
 * `SESSION_SECRET` at boot when `NODE_ENV=production`, so this constant is only
 * reachable in development/test where signing merely needs to be self-consistent.
 */
const DEV_FALLBACK_SECRET = "dev-only-insecure-session-secret-change-me";

function secret(): string {
  return env.SESSION_SECRET ?? DEV_FALLBACK_SECRET;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Mint a signed session token for a user. `now` is injectable for tests; it
 * defaults to the caller stamping the current time.
 */
export function signSessionToken(userId: string, now: number, ttlMs: number = SESSION_TTL_MS): string {
  const expiresAtMs = now + ttlMs;
  const payload = `${b64url(userId)}.${expiresAtMs}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a signed session token. Returns the `userId` when the signature is
 * valid and the token has not expired, otherwise `null`. Fail-closed on any
 * malformed input, bad signature, or expiry.
 */
export function verifySessionToken(token: string, now: number): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedUser, expiresRaw, providedSig] = parts;
  if (!encodedUser || !expiresRaw || !providedSig) return null;

  const payload = `${encodedUser}.${expiresRaw}`;
  const expectedSig = sign(payload);

  // Constant-time comparison; length-mismatch is an immediate reject.
  const provided = Buffer.from(providedSig);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  const expiresAtMs = Number(expiresRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return null;

  try {
    return Buffer.from(encodedUser, "base64url").toString("utf8") || null;
  } catch {
    return null;
  }
}
