import { describe, expect, it } from "vitest";

import { signWebhook, verifyWebhook } from "@/modules/webhooks/signing";

describe("webhook signing", () => {
  const secret = "test-secret-1234567890";
  const body = JSON.stringify({ type: "job.succeeded", jobId: "job_1" });

  it("produces a stable HMAC-SHA256 hex signature", () => {
    const sig = signWebhook(secret, body);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(signWebhook(secret, body)).toBe(sig);
  });

  it("verifies a correct signature", () => {
    expect(verifyWebhook(secret, body, signWebhook(secret, body))).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = signWebhook(secret, body);
    expect(verifyWebhook(secret, body + "x", sig)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyWebhook("other-secret-1234567890", body, signWebhook(secret, body))).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifyWebhook(secret, body, "short")).toBe(false);
  });
});
