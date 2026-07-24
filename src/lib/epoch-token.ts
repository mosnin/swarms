/**
 * Epoch tokens: short-TTL, HMAC-signed bearer tokens for a hosted agent's own
 * wake requests, so a long-lived API key never has to ride along inside the
 * sandbox. A token carries the agent it speaks for, the org it belongs to, an
 * expiry, and a monotonic *epoch* — a per-agent revocation counter. Bumping the
 * stored epoch invalidates every token minted before the bump, giving instant,
 * blast-radius-bounded revocation on top of the short TTL.
 *
 * Format: `et1.<base64url(payload)>.<base64url(hmac)>`. The signature covers the
 * exact `et1.<payload>` bytes, so verification recomputes over the received
 * segment — key order in the JSON never matters. Pure and deterministic via the
 * {@link Clock} seam; the caller owns comparing `claims.epoch` to the agent's
 * current epoch.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { env } from "@/lib/env";
import { systemClock, type Clock } from "@/lib/time";

const VERSION = "et1";
const MIN_TTL_SECONDS = 1;
const MAX_TTL_SECONDS = 3_600; // an epoch token is deliberately short-lived
const DEFAULT_TTL_SECONDS = 300;
/** Tolerated backward clock skew (seconds) when checking not-yet-valid. */
const CLOCK_SKEW_SECONDS = 60;

const DEV_SECRET = "dev-epoch-token-secret-do-not-use-in-prod";

/** The configured epoch-token signing secret (dev fallback outside production). */
export function epochTokenSecret(): string {
  if (env.EPOCH_TOKEN_SECRET) return env.EPOCH_TOKEN_SECRET;
  if (env.NODE_ENV === "production") {
    throw new Error("EPOCH_TOKEN_SECRET is required in production");
  }
  return DEV_SECRET;
}

const claimsSchema = z.object({
  sub: z.string().min(1), // agent instance id
  org: z.string().min(1), // organization id
  epoch: z.number().int().nonnegative(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

export type EpochTokenClaims = z.infer<typeof claimsSchema>;

export interface MintEpochTokenInput {
  agentInstanceId: string;
  organizationId: string;
  epoch: number;
  /** Time-to-live in seconds; clamped to [1, 3600]. Defaults to 300. */
  ttlSeconds?: number;
}

export type VerifyFailure =
  | "malformed"
  | "bad_version"
  | "bad_signature"
  | "expired"
  | "not_yet_valid";

export type VerifyEpochTokenResult =
  | { ok: true; claims: EpochTokenClaims }
  | { ok: false; reason: VerifyFailure };

function b64urlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(secret: string, signingInput: string): string {
  return createHmac("sha256", secret).update(signingInput).digest("base64url");
}

function clampTtl(ttlSeconds: number | undefined): number {
  const ttl = ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(ttl)) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(ttl)));
}

/** Mint a signed epoch token. `iat`/`exp` are derived from the clock. */
export function mintEpochToken(
  input: MintEpochTokenInput,
  secret: string = epochTokenSecret(),
  clock: Clock = systemClock,
): string {
  const iat = Math.floor(clock.now().getTime() / 1000);
  const exp = iat + clampTtl(input.ttlSeconds);
  const claims: EpochTokenClaims = {
    sub: input.agentInstanceId,
    org: input.organizationId,
    epoch: Math.max(0, Math.floor(input.epoch)),
    iat,
    exp,
  };
  const payload = b64urlEncode(JSON.stringify(claims));
  const signingInput = `${VERSION}.${payload}`;
  return `${signingInput}.${sign(secret, signingInput)}`;
}

/**
 * Verify a token's version, signature (constant-time), structure, and time
 * window. Returns typed claims on success or a specific failure reason — never
 * throws on malformed input. The signature is checked *before* the payload is
 * trusted, and the time window *after*, so a tampered token can never surface
 * claims. Epoch revocation is the caller's check against `claims.epoch`.
 */
export function verifyEpochToken(
  token: string,
  secret: string = epochTokenSecret(),
  clock: Clock = systemClock,
): VerifyEpochTokenResult {
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [version, payload, signature] = parts as [string, string, string];
  if (version !== VERSION) return { ok: false, reason: "bad_version" };

  const expected = sign(secret, `${version}.${payload}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const result = claimsSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: "malformed" };
  const claims = result.data;

  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  if (nowSeconds >= claims.exp) return { ok: false, reason: "expired" };
  if (nowSeconds + CLOCK_SKEW_SECONDS < claims.iat) return { ok: false, reason: "not_yet_valid" };

  return { ok: true, claims };
}
