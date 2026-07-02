import { describe, expect, it } from "vitest";

import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  looksLikeApiKey,
  verifyApiKey,
  VISIBLE_PREFIX_LENGTH,
} from "@/modules/identity/api-keys";

describe("API key generation & hashing", () => {
  it("produces a prefixed plaintext key with a short visible prefix", () => {
    const key = generateApiKey();
    expect(key.plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(looksLikeApiKey(key.plaintext)).toBe(true);
    expect(key.prefix).toBe(key.plaintext.slice(0, VISIBLE_PREFIX_LENGTH));
    expect(key.prefix.length).toBe(VISIBLE_PREFIX_LENGTH);
  });

  it("never exposes the plaintext in the stored hash", () => {
    const key = generateApiKey();
    expect(key.hashedKey).not.toContain(key.plaintext);
    expect(key.hashedKey).not.toBe(key.plaintext);
    // SHA-256 hex is 64 chars.
    expect(key.hashedKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a key against its hash and rejects wrong keys", () => {
    const key = generateApiKey();
    expect(verifyApiKey(key.plaintext, key.hashedKey)).toBe(true);
    expect(verifyApiKey(`${API_KEY_PREFIX}wrong`, key.hashedKey)).toBe(false);
  });

  it("supports an HMAC pepper that changes the hash", () => {
    const raw = `${API_KEY_PREFIX}abcdef`;
    const plain = hashApiKey(raw);
    const peppered = hashApiKey(raw, "a-sufficiently-long-pepper");
    expect(peppered).not.toBe(plain);
    expect(verifyApiKey(raw, peppered, "a-sufficiently-long-pepper")).toBe(true);
    expect(verifyApiKey(raw, peppered)).toBe(false);
  });

  it("generates unique keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hashedKey).not.toBe(b.hashedKey);
  });
});
