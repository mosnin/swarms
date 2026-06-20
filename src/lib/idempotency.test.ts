import { describe, expect, it } from "vitest";

import {
  idempotencyKeyFromHeaders,
  isValidIdempotencyKey,
  parseIdempotencyKey,
  reconcileIdempotency,
  requestHash,
  stableStringify,
} from "@/lib/idempotency";
import { isErr, isOk } from "@/lib/result";

describe("idempotency key validation", () => {
  it("accepts well-formed keys", () => {
    expect(isValidIdempotencyKey("order-2026-06-20-abc123")).toBe(true);
    expect(isValidIdempotencyKey("a".repeat(8))).toBe(true);
  });

  it("rejects too-short, too-long, or malformed keys", () => {
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("a".repeat(256))).toBe(false);
    expect(isValidIdempotencyKey("has spaces!")).toBe(false);
    expect(isValidIdempotencyKey(123)).toBe(false);
  });

  it("returns a typed error on parse failure", () => {
    const bad = parseIdempotencyKey("nope");
    expect(isErr(bad)).toBe(true);
    if (isErr(bad)) expect(bad.error.code).toBe("VALIDATION");

    const good = parseIdempotencyKey("valid-key-123");
    expect(isOk(good)).toBe(true);
  });

  it("extracts the key from headers", () => {
    const headers = new Headers({ "Idempotency-Key": "valid-key-123" });
    expect(idempotencyKeyFromHeaders(headers)).toBe("valid-key-123");
    expect(idempotencyKeyFromHeaders(new Headers())).toBeNull();
    expect(idempotencyKeyFromHeaders(new Headers({ "Idempotency-Key": "bad" }))).toBeNull();
  });
});

describe("request fingerprinting", () => {
  it("hashes equal payloads identically regardless of key order", () => {
    const a = requestHash({ amount: 100, currency: "USD" });
    const b = requestHash({ currency: "USD", amount: 100 });
    expect(a).toBe(b);
  });

  it("hashes different payloads differently", () => {
    expect(requestHash({ amount: 100 })).not.toBe(requestHash({ amount: 200 }));
  });

  it("sorts nested object keys deterministically", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});

describe("reconcileIdempotency", () => {
  const hash = requestHash({ amount: 100 });

  it("treats an unseen key as new", () => {
    const r = reconcileIdempotency(hash, null);
    expect(isOk(r) && r.value).toBe("new");
  });

  it("treats a matching hash as a safe replay", () => {
    const r = reconcileIdempotency(hash, hash);
    expect(isOk(r) && r.value).toBe("replay");
  });

  it("rejects a key reused with a different request", () => {
    const r = reconcileIdempotency(hash, requestHash({ amount: 999 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });
});
