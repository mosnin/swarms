/**
 * Provider-agnostic OAuth 2.0 (authorization-code + PKCE) helpers. Point the
 * OAUTH_* env at any compliant IdP. External calls (token exchange, userinfo)
 * have timeouts, bounded exponential-backoff retries, and map failures to the
 * typed error taxonomy — matching the rest of the platform's external-call rules.
 */

import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";

export interface Pkce {
  verifier: string;
  challenge: string;
}

/** Base64url without padding. */
function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Generate a PKCE verifier + S256 challenge and an anti-CSRF `state`. */
export function generatePkce(): Pkce {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function generateState(): string {
  return b64url(randomBytes(16));
}

/** Build the IdP authorization URL for the redirect that starts the flow. */
export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const base = env.OAUTH_AUTHORIZE_URL;
  const clientId = env.OAUTH_CLIENT_ID;
  const redirect = env.OAUTH_REDIRECT_URL;
  if (!base || !clientId || !redirect) {
    throw Errors.config("OAuth is not configured (set AUTH_MODE=oauth and OAUTH_* env)");
  }
  const url = new URL(base);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("scope", env.OAUTH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

const REQUEST_TIMEOUT_MS = 10_000;
const BACKOFF_MS = [0, 500, 1500];

/** Fetch with a timeout + bounded retry on network/5xx failures. */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    if (BACKOFF_MS[attempt]! > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]!));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      // Retry only transient upstream failures.
      if (res.status >= 500 && attempt < BACKOFF_MS.length - 1) {
        lastError = new Error(`upstream ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw Errors.upstream("OAuth provider request failed", lastError);
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
  expires_in: z.number().optional(),
});

/** Exchange an authorization code (+ PKCE verifier) for an access token. */
export async function exchangeCodeForToken(code: string, verifier: string): Promise<string> {
  const tokenUrl = env.OAUTH_TOKEN_URL;
  const clientId = env.OAUTH_CLIENT_ID;
  const clientSecret = env.OAUTH_CLIENT_SECRET;
  const redirect = env.OAUTH_REDIRECT_URL;
  if (!tokenUrl || !clientId || !clientSecret || !redirect) {
    throw Errors.config("OAuth token endpoint is not configured");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: verifier,
  });

  const res = await fetchWithRetry(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw Errors.unauthorized("OAuth token exchange rejected");
  }
  const json: unknown = await res.json().catch(() => null);
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw Errors.upstream("OAuth token response was malformed");
  }
  return parsed.data.access_token;
}

const userInfoSchema = z.object({
  // `sub` is the stable subject; email is what we key the local user on.
  sub: z.string().optional(),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

export interface OAuthUserInfo {
  subject: string | null;
  email: string;
  name: string | null;
}

/** Fetch the authenticated user's profile from the IdP userinfo endpoint. */
export async function fetchUserInfo(accessToken: string): Promise<OAuthUserInfo> {
  const url = env.OAUTH_USERINFO_URL;
  if (!url) throw Errors.config("OAuth userinfo endpoint is not configured");

  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (!res.ok) throw Errors.unauthorized("OAuth userinfo request rejected");

  const json: unknown = await res.json().catch(() => null);
  const parsed = userInfoSchema.safeParse(json);
  if (!parsed.success) {
    throw Errors.upstream("OAuth userinfo response was malformed or missing email");
  }
  return {
    subject: parsed.data.sub ?? null,
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name ?? null,
  };
}
