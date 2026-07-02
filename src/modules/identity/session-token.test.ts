import { describe, expect, it } from "vitest";

import { SESSION_TTL_MS, signSessionToken, verifySessionToken } from "./session-token";

describe("session token", () => {
  const now = 1_000_000_000_000;

  it("round-trips a valid token", () => {
    const token = signSessionToken("usr_abc", now);
    expect(verifySessionToken(token, now + 1000)).toBe("usr_abc");
  });

  it("rejects an expired token", () => {
    const token = signSessionToken("usr_abc", now, 1000);
    expect(verifySessionToken(token, now + 2000)).toBeNull();
  });

  it("rejects a tampered userId", () => {
    const token = signSessionToken("usr_abc", now);
    const [, exp, sig] = token.split(".");
    const forged = `${Buffer.from("usr_victim").toString("base64url")}.${exp}.${sig}`;
    expect(verifySessionToken(forged, now + 1000)).toBeNull();
  });

  it("rejects a tampered expiry", () => {
    const token = signSessionToken("usr_abc", now, 1000);
    const [user, , sig] = token.split(".");
    const forged = `${user}.${now + 999_999_999}.${sig}`;
    expect(verifySessionToken(forged, now + 5000)).toBeNull();
  });

  it("rejects a raw unsigned userId (the old vulnerability)", () => {
    expect(verifySessionToken("usr_abc", now)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken("", now)).toBeNull();
    expect(verifySessionToken("a.b", now)).toBeNull();
    expect(verifySessionToken("a.b.c.d", now)).toBeNull();
  });

  it("defaults to a 7-day TTL", () => {
    const token = signSessionToken("usr_abc", now);
    expect(verifySessionToken(token, now + SESSION_TTL_MS - 1)).toBe("usr_abc");
    expect(verifySessionToken(token, now + SESSION_TTL_MS + 1)).toBeNull();
  });
});
