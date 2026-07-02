/**
 * User session abstraction for human dashboard access.
 *
 * The platform separates *how a session is established* (an identity provider /
 * cookie store — environment specific) from *what a session means* (a resolved
 * user + active organization). This module defines the session contract and a
 * request reader. Turning a session into an {@link AuthContext} (loading the
 * membership + role) happens in `service.ts`.
 */

import { verifySessionToken } from "@/modules/identity/session-token";

export const SESSION_COOKIE = "swarms_session";
export const SESSION_USER_HEADER = "x-swarms-user-id";
export const ACTIVE_ORG_COOKIE = "swarms_active_org";
export const ACTIVE_ORG_HEADER = "x-swarms-org-id";

export interface SessionRef {
  /** The authenticated user id. */
  userId: string;
  /** Optional explicitly-selected active organization. */
  organizationId?: string;
}

interface RequestLike {
  headers: Headers;
  cookies?: { get(name: string): { value: string } | undefined };
}

/**
 * Extract a session reference from request headers/cookies. Returns `null` when
 * no session identifier is present.
 *
 * The session cookie value is a signed token (see {@link verifySessionToken}):
 * its signature and expiry are verified before the embedded userId is trusted,
 * so a raw/forged cookie can never impersonate a user in any environment.
 *
 * LOCAL DEV ADAPTER: the `x-swarms-user-id` header path accepts an unverified
 * userId for local development convenience. It is BLOCKED in production — in a
 * real deployment the user id must come from the verified signed cookie.
 * `service.ts` also supports a `DEV_AUTH_USER_EMAIL` fallback, dev-only.
 */
export function readSessionRef(request: RequestLike, now: number = Date.now()): SessionRef | null {
  // Never trust the raw user-id header in production — an attacker who can set
  // request headers would otherwise be able to impersonate any user.
  const isProduction = process.env.NODE_ENV === "production";
  const headerUser = isProduction ? null : request.headers.get(SESSION_USER_HEADER);

  // The cookie is a signed token; verify its signature + expiry before trusting
  // the identity. A missing/invalid/expired signature yields no cookie identity.
  const rawCookie = request.cookies?.get(SESSION_COOKIE)?.value;
  const cookieUser = rawCookie ? verifySessionToken(rawCookie, now) : null;

  const userId = headerUser ?? cookieUser;
  if (!userId) return null;

  const headerOrg = request.headers.get(ACTIVE_ORG_HEADER);
  const cookieOrg = request.cookies?.get(ACTIVE_ORG_COOKIE)?.value;
  const organizationId = headerOrg ?? cookieOrg ?? undefined;

  return { userId, organizationId };
}
