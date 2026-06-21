/**
 * User session abstraction for human dashboard access.
 *
 * The platform separates *how a session is established* (an identity provider /
 * cookie store — environment specific) from *what a session means* (a resolved
 * user + active organization). This module defines the session contract and a
 * request reader. Turning a session into an {@link AuthContext} (loading the
 * membership + role) happens in `service.ts`.
 */

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
 * LOCAL DEV ADAPTER: in a real deployment the user id comes from a verified,
 * signed session (set by the IdP callback). Here we also accept a header/cookie
 * carrying the user id directly. `service.ts` additionally supports a
 * `DEV_AUTH_USER_EMAIL` fallback for local development only.
 */
export function readSessionRef(request: RequestLike): SessionRef | null {
  const headerUser = request.headers.get(SESSION_USER_HEADER);
  const cookieUser = request.cookies?.get(SESSION_COOKIE)?.value;
  const userId = headerUser ?? cookieUser;
  if (!userId) return null;

  const headerOrg = request.headers.get(ACTIVE_ORG_HEADER);
  const cookieOrg = request.cookies?.get(ACTIVE_ORG_COOKIE)?.value;
  const organizationId = headerOrg ?? cookieOrg ?? undefined;

  return { userId, organizationId };
}
