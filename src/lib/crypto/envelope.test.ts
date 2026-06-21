import { describe, expect, it } from "vitest";

import { decryptJson, decryptSecret, encryptJson, encryptSecret } from "@/lib/crypto/envelope";

describe("envelope encryption", () => {
  it("round-trips a string secret", () => {
    const blob = encryptSecret("super-secret-token");
    expect(blob.ciphertext).not.toContain("super-secret");
    expect(decryptSecret(blob)).toBe("super-secret-token");
  });

  it("round-trips a JSON secret", () => {
    const secrets = { apiKey: "abc", refresh: "xyz" };
    const blob = encryptJson(secrets);
    expect(decryptJson(blob)).toEqual(secrets);
  });

  it("uses a fresh IV per encryption (ciphertext differs)", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails to decrypt a tampered ciphertext (GCM auth)", () => {
    const blob = encryptSecret("secret");
    const tampered = { ...blob, ciphertext: Buffer.from("evil").toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("fails to decrypt with a tampered tag", () => {
    const blob = encryptSecret("secret");
    const tampered = { ...blob, tag: Buffer.alloc(16, 0).toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
