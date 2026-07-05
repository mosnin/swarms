/**
 * GET /api/auth/callback — OAuth redirect handler.
 *
 * Verifies the anti-CSRF `state`, exchanges the authorization code (with the
 * PKCE verifier) for an access token, fetches the user's email from the IdP,
 * provisions the local user on first login, mints the signed session cookie,
 * and redirects to the dashboard. Only active when AUTH_MODE=oauth.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveOrCreateUserByEmail } from "@/modules/identity/provisioning";
import {
  clearTransientCookie,
  sessionSetCookie,
} from "@/modules/identity/session-cookie";
import { exchangeCodeForToken, fetchUserInfo } from "@/server/auth/oauth";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from "@/app/api/auth/login/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failRedirect(reason: string): NextResponse {
  const url = new URL("/dashboard", env.APP_BASE_URL);
  url.searchParams.set("auth_error", reason);
  const res = NextResponse.redirect(url);
  res.headers.append("Set-Cookie", clearTransientCookie(OAUTH_STATE_COOKIE));
  res.headers.append("Set-Cookie", clearTransientCookie(OAUTH_VERIFIER_COOKIE));
  return res;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (env.AUTH_MODE !== "oauth") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "OAuth login is not enabled (AUTH_MODE!=oauth)" } },
      { status: 404 },
    );
  }

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;

  // Anti-CSRF: the state echoed by the IdP must match the one we set.
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return failRedirect("invalid_state");
  }

  let email: string;
  let name: string | null;
  try {
    const accessToken = await exchangeCodeForToken(code, verifier);
    const info = await fetchUserInfo(accessToken);
    email = info.email;
    name = info.name;
  } catch (err) {
    logger.warn("OAuth callback failed", { error: err instanceof Error ? err.message : String(err) });
    return failRedirect("exchange_failed");
  }

  const { userId } = await resolveOrCreateUserByEmail(email, name, getDb());

  const dest = new URL("/dashboard", env.APP_BASE_URL);
  const res = NextResponse.redirect(dest);
  res.headers.append("Set-Cookie", sessionSetCookie(userId, Date.now()));
  res.headers.append("Set-Cookie", clearTransientCookie(OAUTH_STATE_COOKIE));
  res.headers.append("Set-Cookie", clearTransientCookie(OAUTH_VERIFIER_COOKIE));
  return res;
}
