import { describe, expect, it } from "vitest";
import { assertSafeUrl, type HostResolver } from "./ssrf-guard";

// Deterministic resolver for the DNS path: public names map to a public IP,
// "internal.example" maps to a link-local address (simulating a rebinding host).
const stubResolve: HostResolver = async (host) => {
  if (host === "internal.example") return [{ address: "169.254.169.254" }];
  if (host === "mixed.example") return [{ address: "93.184.216.34" }, { address: "10.0.0.5" }];
  if (host === "nxdomain.example") throw new Error("ENOTFOUND");
  return [{ address: "93.184.216.34" }];
};

describe("assertSafeUrl", () => {
  it("allows public HTTPS/HTTP URLs (resolver returns public IP)", async () => {
    await expect(assertSafeUrl("https://example.com/webhook", "url", stubResolve)).resolves.toBeUndefined();
    await expect(assertSafeUrl("http://example.com/callback", "url", stubResolve)).resolves.toBeUndefined();
  });

  it("blocks localhost and localhost subdomains", async () => {
    await expect(assertSafeUrl("http://localhost/admin", "url", stubResolve)).rejects.toThrow(/private, loopback/);
    await expect(assertSafeUrl("http://LOCALHOST/admin", "url", stubResolve)).rejects.toThrow(/private, loopback/);
  });

  it("blocks IPv4 loopback and private ranges", async () => {
    for (const u of [
      "http://127.0.0.1/data",
      "http://127.1.2.3/data",
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://100.64.0.1/", // CGNAT
      "http://0.0.0.0/",
    ]) {
      await expect(assertSafeUrl(u, "url", stubResolve)).rejects.toThrow(/private, loopback/);
    }
  });

  it("blocks decimal-encoded loopback (URL normalizes to 127.0.0.1)", async () => {
    await expect(assertSafeUrl("http://2130706433/", "url", stubResolve)).rejects.toThrow(/private, loopback/);
  });

  it("blocks link-local / metadata address", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data/", "url", stubResolve)).rejects.toThrow(
      /private, loopback/,
    );
  });

  it("blocks IPv6 loopback and unique-local", async () => {
    await expect(assertSafeUrl("http://[::1]/", "url", stubResolve)).rejects.toThrow(/private, loopback/);
    await expect(assertSafeUrl("http://[fc00::1]/", "url", stubResolve)).rejects.toThrow(/private, loopback/);
    await expect(assertSafeUrl("http://[fe80::1]/", "url", stubResolve)).rejects.toThrow(/private, loopback/);
  });

  it("blocks IPv4-mapped IPv6 bypasses (regression)", async () => {
    // Previously slipped past the hostname-regex blocklist.
    await expect(assertSafeUrl("http://[::ffff:169.254.169.254]/", "url", stubResolve)).rejects.toThrow(
      /private, loopback/,
    );
    await expect(assertSafeUrl("http://[::ffff:127.0.0.1]/", "url", stubResolve)).rejects.toThrow(
      /private, loopback/,
    );
    // hex form of the same mapped addresses
    await expect(assertSafeUrl("http://[::ffff:a9fe:a9fe]/", "url", stubResolve)).rejects.toThrow(
      /private, loopback/,
    );
  });

  it("blocks a DNS name that resolves to an internal address (rebinding)", async () => {
    await expect(assertSafeUrl("http://internal.example/", "url", stubResolve)).rejects.toThrow(
      /private, loopback/,
    );
  });

  it("blocks when any resolved address is internal", async () => {
    await expect(assertSafeUrl("http://mixed.example/", "url", stubResolve)).rejects.toThrow(/private, loopback/);
  });

  it("fails closed on an unresolvable host", async () => {
    await expect(assertSafeUrl("http://nxdomain.example/", "url", stubResolve)).rejects.toThrow(
      /could not be resolved/,
    );
  });

  it("blocks cloud metadata endpoints by hostname", async () => {
    await expect(
      assertSafeUrl("http://metadata.google.internal/computeMetadata/v1/", "url", stubResolve),
    ).rejects.toThrow(/private, loopback/);
  });

  it("blocks non-http/https schemes", async () => {
    await expect(assertSafeUrl("file:///etc/passwd", "url", stubResolve)).rejects.toThrow(/http or https/);
    await expect(assertSafeUrl("ftp://example.com/file", "url", stubResolve)).rejects.toThrow(/http or https/);
    await expect(assertSafeUrl("javascript:alert(1)", "url", stubResolve)).rejects.toThrow();
  });

  it("rejects malformed URLs", async () => {
    await expect(assertSafeUrl("not-a-url", "url", stubResolve)).rejects.toThrow(/not a valid URL/);
    await expect(assertSafeUrl("", "url", stubResolve)).rejects.toThrow();
  });

  it("includes the fieldName in error messages", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/", "callbackUrl", stubResolve)).rejects.toThrow(/callbackUrl/);
    await expect(assertSafeUrl("ftp://example.com", "webhookUrl", stubResolve)).rejects.toThrow(/webhookUrl/);
  });
});
