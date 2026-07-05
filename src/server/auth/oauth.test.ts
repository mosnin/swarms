import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { buildAuthorizeUrl, generatePkce, generateState } from "@/server/auth/oauth";

const OAUTH_ENV = {
  OAUTH_AUTHORIZE_URL: "https://idp.example.com/authorize",
  OAUTH_CLIENT_ID: "client-123",
  OAUTH_REDIRECT_URL: "https://app.example.com/api/auth/callback",
  OAUTH_SCOPES: "openid email profile",
};

describe("oauth PKCE", () => {
  it("derives an S256 challenge from the verifier", () => {
    const { verifier, challenge } = generatePkce();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
    // base64url — no padding or url-unsafe chars.
    expect(verifier).not.toMatch(/[+/=]/);
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it("generates unique verifiers and states", () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier);
    expect(generateState()).not.toBe(generateState());
  });
});

describe("buildAuthorizeUrl", () => {
  afterEach(() => {
    for (const k of Object.keys(OAUTH_ENV)) delete process.env[k];
  });

  it("builds a compliant authorize URL with PKCE + state", () => {
    Object.assign(process.env, OAUTH_ENV);
    const url = new URL(buildAuthorizeUrl("state-abc", "challenge-xyz"));
    expect(url.origin + url.pathname).toBe("https://idp.example.com/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(OAUTH_ENV.OAUTH_REDIRECT_URL);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-xyz");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("throws a config error when OAuth is not configured", () => {
    expect(() => buildAuthorizeUrl("s", "c")).toThrowError();
  });
});
