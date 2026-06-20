import { describe, expect, it } from "vitest";

import { REDACTED, redact } from "@/lib/redaction";

describe("redact", () => {
  it("masks values under sensitive keys", () => {
    const out = redact({ name: "ok", password: "hunter2", apiKey: "hc_live_abc" });
    expect(out).toEqual({ name: "ok", password: REDACTED, apiKey: REDACTED });
  });

  it("masks nested sensitive keys", () => {
    const out = redact({ user: { email: "a@b.com", session: { token: "t" } } });
    expect(out).toEqual({ user: { email: "a@b.com", session: { token: REDACTED } } });
  });

  it("masks secret-looking values even under innocuous keys", () => {
    const out = redact({ note: "use Bearer abc.def.ghi to auth" });
    expect(out.note).toBe(`use ${REDACTED} to auth`);
  });

  it("masks Hermes Cloud API keys embedded in strings", () => {
    expect(redact("key is hc_live_ZZZ999")).toBe(`key is ${REDACTED}`);
  });

  it("redacts inside arrays", () => {
    const out = redact([{ secret: "x" }, { ok: 1 }]);
    expect(out).toEqual([{ secret: REDACTED }, { ok: 1 }]);
  });

  it("handles circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const out = redact(obj) as Record<string, unknown>;
    expect(out.a).toBe(1);
    expect(out.self).toBe("[Circular]");
  });

  it("passes through primitives", () => {
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
    expect(redact(true)).toBe(true);
  });
});
