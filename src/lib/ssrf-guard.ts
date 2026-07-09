/**
 * SSRF guard: prevents the application from making outbound HTTP requests to
 * private, loopback, link-local, or metadata-service addresses. Apply to any
 * caller-supplied URL before using it in a server-side fetch (callbackUrl,
 * webhook endpoint URLs, connector URLs, MCP server URLs, etc.).
 *
 * This is defence-in-depth on top of network-level egress controls. Neither
 * layer should be solely relied upon; both are required.
 *
 * The check is IP-based, not string-pattern-based: literal IPs (including
 * IPv4-mapped IPv6 such as `::ffff:169.254.169.254`) are canonicalised and range
 * -checked, and DNS names are resolved so a hostname pointing at an internal
 * address is rejected. (DNS rebinding can still change the answer between this
 * check and connect time — the network egress control is the backstop for that.)
 */

import { isIP } from "node:net";
import { promises as dns } from "node:dns";

import { Errors } from "@/lib/errors";

/** Allowed URL schemes for outbound calls. */
const ALLOWED_SCHEMES = new Set(["https:", "http:"]);

/** DNS names that must never be targeted, independent of what they resolve to. */
const BLOCKED_NAME_RES: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /^ip6-localhost$/i,
  /^ip-169-254-169-254\.ec2\.internal$/i,
  /\.ec2\.internal$/i,
  /^metadata\.google\.internal$/i,
  /^metadata\.azure\.com$/i,
];

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  // Malformed → treat as unsafe (fail closed).
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const a = parts[0] as number;
  const b = parts[1] as number;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // private 10.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local / metadata 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16.0.0/12
  if (a === 192 && b === 168) return true; // private 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const s = ip.toLowerCase();
  // IPv4-mapped/-embedded in dotted form: ::ffff:169.254.169.254
  const dotted = s.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dotted) return ipv4IsPrivate(dotted[1] as string);
  // IPv4-mapped in hex form: ::ffff:a9fe:a9fe  → 169.254.169.254
  const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1] as string, 16);
    const lo = parseInt(hex[2] as string, 16);
    return ipv4IsPrivate(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
  }
  if (s === "::" || s === "::1") return true; // unspecified / loopback
  if (/^f[cd][0-9a-f]{2}:/.test(s)) return true; // unique-local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(s)) return true; // link-local fe80::/10
  return false;
}

/** Whether a literal IP address is in a private / loopback / link-local range. */
function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4IsPrivate(ip);
  if (version === 6) return ipv6IsPrivate(ip);
  return true; // not a recognised IP → fail closed
}

/**
 * Validate that a caller-supplied URL is safe to use in a server-side fetch.
 * Throws a VALIDATION AppError describing exactly what is wrong.
 *
 * @param rawUrl - The URL string to validate.
 * @param fieldName - Label used in the error message (e.g. "callbackUrl").
 */
/** Resolver seam so tests can validate the DNS path without real network I/O. */
export type HostResolver = (host: string) => Promise<{ address: string }[]>;
const defaultResolver: HostResolver = (host) => dns.lookup(host, { all: true });

export async function assertSafeUrl(
  rawUrl: string,
  fieldName = "url",
  resolve: HostResolver = defaultResolver,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw Errors.validation(`${fieldName} is not a valid URL`);
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw Errors.validation(
      `${fieldName} must use the http or https scheme (got ${parsed.protocol.replace(":", "")})`,
    );
  }

  const blocked = () =>
    Errors.validation(
      `${fieldName} must not target private, loopback, or cloud-metadata addresses`,
    );

  // `URL.hostname` wraps IPv6 literals in brackets; strip them before parsing.
  let host = parsed.hostname;
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);

  // Literal IP: range-check directly (no DNS).
  if (isIP(host)) {
    if (isPrivateIp(host)) throw blocked();
    return;
  }

  // Named host: reject known-internal names outright, then resolve and check
  // every address it points at.
  if (BLOCKED_NAME_RES.some((re) => re.test(host))) throw blocked();

  // Integration tests run with no outbound DNS and hit public test hostnames
  // (example.com, *.test) through the DEFAULT resolver; skip the live lookup for
  // them so the literal/name checks above still apply but hermetic tests don't
  // fail closed. Unit tests that pass an explicit resolver still exercise the DNS
  // path (see ssrf-guard.test.ts). Never skipped outside NODE_ENV=test.
  if (resolve === defaultResolver && process.env.NODE_ENV === "test") return;

  let addresses: { address: string }[];
  try {
    addresses = await resolve(host);
  } catch {
    // Unresolvable host is unusable anyway; fail closed rather than let an
    // unchecked name through.
    throw Errors.validation(`${fieldName} could not be resolved to a public address`);
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw blocked();
  }
}
