/**
 * Unit: epoch-token mint/verify. A minted token round-trips to its claims;
 * any tamper, wrong version, expiry, or premature use is rejected with a
 * specific reason; the TTL is clamped; and verification is total (never throws)
 * on garbage input.
 */

import { describe, expect, it } from "vitest";

import { fixedClock } from "@/lib/time";
import { mintEpochToken, verifyEpochToken } from "@/lib/epoch-token";

const SECRET = "unit-test-epoch-secret-at-least-32-chars-long";
const AT = new Date("2026-07-24T12:00:00.000Z");

function clockAt(iso: string) {
  return fixedClock(new Date(iso));
}

describe("epoch-token", () => {
  it("round-trips claims for a valid token", () => {
    const clock = clockAt("2026-07-24T12:00:00.000Z");
    const token = mintEpochToken(
      { agentInstanceId: "agi_1", organizationId: "org_1", epoch: 3, ttlSeconds: 300 },
      SECRET,
      clock,
    );
    const result = verifyEpochToken(token, SECRET, clock);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.sub).toBe("agi_1");
    expect(result.claims.org).toBe("org_1");
    expect(result.claims.epoch).toBe(3);
    expect(result.claims.exp - result.claims.iat).toBe(300);
    expect(Number.isInteger(result.claims.iat)).toBe(true);
  });

  it("rejects a token whose payload was tampered with", () => {
    const clock = clockAt("2026-07-24T12:00:00.000Z");
    const token = mintEpochToken({ agentInstanceId: "agi_1", organizationId: "org_1", epoch: 0 }, SECRET, clock);
    const [v, , s] = token.split(".");
    // Forge a payload claiming a different org; keep the original signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "agi_1", org: "org_ATTACKER", epoch: 0, iat: 0, exp: 9_999_999_999 }),
    ).toString("base64url");
    const forged = `${v}.${forgedPayload}.${s}`;
    const result = verifyEpochToken(forged, SECRET, clock);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token signed with a different secret", () => {
    const clock = clockAt("2026-07-24T12:00:00.000Z");
    const token = mintEpochToken({ agentInstanceId: "agi_1", organizationId: "org_1", epoch: 0 }, SECRET, clock);
    expect(verifyEpochToken(token, "some-other-secret-of-sufficient-length-xx", clock)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects an unknown version prefix", () => {
    const clock = clockAt("2026-07-24T12:00:00.000Z");
    const token = mintEpochToken({ agentInstanceId: "agi_1", organizationId: "org_1", epoch: 0 }, SECRET, clock);
    const forged = `et2.${token.split(".").slice(1).join(".")}`;
    expect(verifyEpochToken(forged, SECRET, clock)).toEqual({ ok: false, reason: "bad_version" });
  });

  it("rejects an expired token", () => {
    const token = mintEpochToken(
      { agentInstanceId: "agi_1", organizationId: "org_1", epoch: 0, ttlSeconds: 60 },
      SECRET,
      fixedClock(AT),
    );
    const later = fixedClock(new Date(AT.getTime() + 61_000));
    expect(verifyEpochToken(token, SECRET, later)).toEqual({ ok: false, reason: "expired" });
  });

  it("honors a token right up to but not including its expiry", () => {
    const token = mintEpochToken(
      { agentInstanceId: "agi_1", organizationId: "org_1", epoch: 0, ttlSeconds: 60 },
      SECRET,
      fixedClock(AT),
    );
    const justBefore = fixedClock(new Date(AT.getTime() + 59_000));
    expect(verifyEpochToken(token, SECRET, justBefore).ok).toBe(true);
    const atExpiry = fixedClock(new Date(AT.getTime() + 60_000));
    expect(verifyEpochToken(token, SECRET, atExpiry)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token that is not yet valid beyond the skew window", () => {
    const token = mintEpochToken(
      { agentInstanceId: "agi_1", organizationId: "org_1", epoch: 0, ttlSeconds: 300 },
      SECRET,
      fixedClock(AT),
    );
    // A verifier whose clock is far behind the issuer sees it as not-yet-valid.
    const wayBehind = fixedClock(new Date(AT.getTime() - 120_000));
    expect(verifyEpochToken(token, SECRET, wayBehind)).toEqual({ ok: false, reason: "not_yet_valid" });
    // ...but a small skew is tolerated.
    const slightlyBehind = fixedClock(new Date(AT.getTime() - 30_000));
    expect(verifyEpochToken(token, SECRET, slightlyBehind).ok).toBe(true);
  });

  it("clamps the TTL to the allowed range", () => {
    const clock = clockAt("2026-07-24T12:00:00.000Z");
    const tooLong = mintEpochToken(
      { agentInstanceId: "agi_1", organizationId: "org_1", epoch: 0, ttlSeconds: 100_000 },
      SECRET,
      clock,
    );
    const r1 = verifyEpochToken(tooLong, SECRET, clock);
    expect(r1.ok && r1.claims.exp - r1.claims.iat).toBe(3_600);

    const tooShort = mintEpochToken(
      { agentInstanceId: "agi_1", organizationId: "org_1", epoch: 0, ttlSeconds: 0 },
      SECRET,
      clock,
    );
    const r2 = verifyEpochToken(tooShort, SECRET, clock);
    expect(r2.ok && r2.claims.exp - r2.claims.iat).toBe(1);
  });

  it("never throws on malformed input", () => {
    const clock = clockAt("2026-07-24T12:00:00.000Z");
    for (const bad of ["", "a", "a.b", "a.b.c.d", "et1..", "et1.notbase64!.sig"]) {
      const r = verifyEpochToken(bad, SECRET, clock);
      expect(r.ok).toBe(false);
    }
  });
});
