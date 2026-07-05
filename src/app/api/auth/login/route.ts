/**
 * GET /api/auth/login — start the OAuth authorization-code + PKCE flow.
 *
 * Generates a PKCE verifier + anti-CSRF `state`, stashes them in short-lived
 * HttpOnly cookies, and redirects the browser to the IdP authorize endpoint.
 * Only active when AUTH_MODE=oauth (dev uses /api/auth/dev-login).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { transientCookie } from "@/modules/identity/session-cookie";
import { buildAuthorizeUrl, generatePkce, generateState } from "@/server/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OAUTH_STATE_COOKIE = "swarms_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "swarms_oauth_verifier";

export async function GET(_request: NextRequest): Promise<Response> {
  if (env.AUTH_MODE !== "oauth") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "OAuth login is not enabled (AUTH_MODE!=oauth)" } },
      { status: 404 },
    );
  }

  const state = generateState();
  const { verifier, challenge } = generatePkce();
  const authorizeUrl = buildAuthorizeUrl(state, challenge);

  const res = NextResponse.redirect(authorizeUrl);
  res.headers.append("Set-Cookie", transientCookie(OAUTH_STATE_COOKIE, state));
  res.headers.append("Set-Cookie", transientCookie(OAUTH_VERIFIER_COOKIE, verifier));
  return res;
}
