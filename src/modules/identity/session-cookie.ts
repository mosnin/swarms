/**
 * Session cookie helpers. One place builds the hardened `Set-Cookie` header for
 * the signed session token, so every issuance path (OAuth callback, dev-login)
 * and the logout path share identical attributes: HttpOnly, SameSite=Lax, Path=/,
 * and Secure in production.
 */

import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/modules/identity/session";
import { SESSION_TTL_MS, signSessionToken } from "@/modules/identity/session-token";

/** Short-lived cookies that carry the OAuth anti-CSRF state + PKCE verifier. */
export const OAUTH_STATE_COOKIE = "swarms_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "swarms_oauth_verifier";

function secureAttr(): string {
  return env.NODE_ENV === "production" ? "; Secure" : "";
}

/** Build a Set-Cookie header that establishes a signed session for `userId`. */
export function sessionSetCookie(userId: string, now: number): string {
  const token = signSessionToken(userId, now);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttr()}`;
}

/** Build a Set-Cookie header that clears the session. */
export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr()}`;
}

/** Build a short-lived HttpOnly cookie (OAuth state/PKCE transfer). */
export function transientCookie(name: string, value: string, maxAgeSeconds = 600): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureAttr()}`;
}

/** Clear a transient cookie. */
export function clearTransientCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr()}`;
}
