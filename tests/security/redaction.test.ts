/**
 * Security: secrets must never reach logs, audit metadata, or diagnostics.
 */

import { describe, expect, it } from "vitest";

import { REDACTED, redact } from "@/lib/redaction";

describe("secret redaction", () => {
  it("redacts API keys, hashes, tokens, and credentials by key", () => {
    const out = redact({
      apiKey: "hc_live_abc",
      hashedKey: "deadbeef",
      authorization: "Bearer xyz",
      encryptedCredentials: "blob",
      password: "p",
      normal: "kept",
    });
    expect(out).toMatchObject({
      apiKey: REDACTED,
      hashedKey: REDACTED,
      authorization: REDACTED,
      encryptedCredentials: REDACTED,
      password: REDACTED,
      normal: "kept",
    });
  });

  it("redacts secret-shaped values even under innocuous keys", () => {
    const out = redact({ message: "token hc_live_LEAKED was used" });
    expect(out.message).not.toContain("hc_live_LEAKED");
    expect(out.message).toContain(REDACTED);
  });

  it("redacts payment proof material nested in audit detail", () => {
    const out = redact({ after: { proof: { txRef: "0xabc", secret: "s" } } }) as {
      after: { proof: unknown };
    };
    expect(out.after.proof).toBe(REDACTED);
  });
});
