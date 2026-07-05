import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAuthorizeUrl, fetchUserInfo, generatePkce, generateState } from "@/server/auth/oauth";

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

describe("fetchUserInfo — email_verified enforcement", () => {
  afterEach(() => {
    delete process.env.OAUTH_USERINFO_URL;
    vi.unstubAllGlobals();
  });

  function stubUserinfo(body: unknown) {
    process.env.OAUTH_USERINFO_URL = "https://idp.example.com/userinfo";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status: 200 }));
  }

  it("accepts a verified email", async () => {
    stubUserinfo({ sub: "s1", email: "Alice@Example.com", email_verified: true, name: "Alice" });
    const info = await fetchUserInfo("tok");
    expect(info.email).toBe("alice@example.com"); // normalized
    expect(info.subject).toBe("s1");
  });

  it("rejects an unverified email (account-takeover guard)", async () => {
    stubUserinfo({ sub: "s2", email: "victim@example.com", email_verified: false });
    await expect(fetchUserInfo("tok")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects when email_verified is absent (cannot prove verification)", async () => {
    stubUserinfo({ sub: "s3", email: "victim@example.com" });
    await expect(fetchUserInfo("tok")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
