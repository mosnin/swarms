import { describe, expect, it } from "vitest";
import { assertSafeUrl } from "./ssrf-guard";

describe("assertSafeUrl", () => {
  it("allows public HTTPS URLs", () => {
    expect(() => assertSafeUrl("https://example.com/webhook")).not.toThrow();
    expect(() => assertSafeUrl("https://hooks.slack.com/services/abc")).not.toThrow();
    expect(() => assertSafeUrl("https://api.github.com/repos/foo/bar")).not.toThrow();
  });

  it("allows public HTTP URLs", () => {
    expect(() => assertSafeUrl("http://example.com/callback")).not.toThrow();
  });

  it("blocks localhost", () => {
    expect(() => assertSafeUrl("http://localhost/admin")).toThrow(/private, loopback/);
    expect(() => assertSafeUrl("http://LOCALHOST/admin")).toThrow(/private, loopback/);
  });

  it("blocks IPv4 loopback (127.x.x.x)", () => {
    expect(() => assertSafeUrl("http://127.0.0.1/data")).toThrow(/private, loopback/);
    expect(() => assertSafeUrl("http://127.1.2.3/data")).toThrow(/private, loopback/);
  });

  it("blocks RFC-1918 private ranges", () => {
    expect(() => assertSafeUrl("http://10.0.0.1/")).toThrow(/private, loopback/);
    expect(() => assertSafeUrl("http://10.255.255.255/")).toThrow(/private, loopback/);
    expect(() => assertSafeUrl("http://172.16.0.1/")).toThrow(/private, loopback/);
    expect(() => assertSafeUrl("http://172.31.255.255/")).toThrow(/private, loopback/);
    expect(() => assertSafeUrl("http://192.168.1.1/")).toThrow(/private, loopback/);
  });

  it("blocks link-local / APIPA range", () => {
    expect(() => assertSafeUrl("http://169.254.169.254/latest/meta-data/")).toThrow(
      /private, loopback/,
    );
    expect(() => assertSafeUrl("http://169.254.0.1/")).toThrow(/private, loopback/);
  });

  it("blocks cloud metadata endpoints by hostname", () => {
    expect(() =>
      assertSafeUrl("http://metadata.google.internal/computeMetadata/v1/"),
    ).toThrow(/private, loopback/);
  });

  it("blocks non-http/https schemes", () => {
    expect(() => assertSafeUrl("file:///etc/passwd", "url")).toThrow(/http or https/);
    expect(() => assertSafeUrl("ftp://example.com/file", "url")).toThrow(/http or https/);
    expect(() => assertSafeUrl("javascript:alert(1)", "url")).toThrow();
  });

  it("rejects malformed URLs", () => {
    expect(() => assertSafeUrl("not-a-url")).toThrow(/not a valid URL/);
    expect(() => assertSafeUrl("")).toThrow();
  });

  it("includes the fieldName in error messages", () => {
    expect(() => assertSafeUrl("http://127.0.0.1/", "callbackUrl")).toThrow(/callbackUrl/);
    expect(() => assertSafeUrl("ftp://example.com", "webhookUrl")).toThrow(/webhookUrl/);
  });
});
