/**
 * SSRF guard: prevents the application from making outbound HTTP requests to
 * private, loopback, link-local, or metadata-service addresses. Apply to any
 * caller-supplied URL before using it in a server-side fetch (callbackUrl,
 * webhook endpoint URLs, connector URLs, MCP server URLs, etc.).
 *
 * This is defence-in-depth on top of network-level egress controls. Neither
 * layer should be solely relied upon; both are required.
 */

import { Errors } from "@/lib/errors";

/** Allowed URL schemes for outbound calls. */
const ALLOWED_SCHEMES = new Set(["https:", "http:"]);

/**
 * Hostnames / IP patterns that must never be targeted by server-side fetches.
 *
 * Covers:
 *  - IPv4 loopback (127.0.0.0/8)
 *  - IPv4 private (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 *  - IPv4 link-local / APIPA (169.254.0.0/16)
 *  - IPv4 any (0.0.0.0)
 *  - IPv6 loopback (::1)
 *  - IPv6 unique-local (fc00::/7)
 *  - IPv6 link-local (fe80::/10)
 *  - AWS/GCP/Azure instance metadata endpoints
 *  - Bare "localhost" and common variants
 */
const BLOCKED_HOST_RES: RegExp[] = [
  /^127(\.\d{1,3}){3}$/,
  /^10(\.\d{1,3}){3}$/,
  /^192\.168(\.\d{1,3}){2}$/,
  /^172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}$/,
  /^169\.254(\.\d{1,3}){2}$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe[89ab][0-9a-f]:/i,
  /^localhost$/i,
  /^ip-169-254-169-254\.ec2\.internal$/i,
  /^metadata\.google\.internal$/i,
  /^metadata\.azure\.com$/i,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST_RES.some((re) => re.test(hostname));
}

/**
 * Validate that a caller-supplied URL is safe to use in a server-side fetch.
 * Throws a VALIDATION AppError describing exactly what is wrong.
 *
 * @param rawUrl - The URL string to validate.
 * @param fieldName - Label used in the error message (e.g. "callbackUrl").
 */
export function assertSafeUrl(rawUrl: string, fieldName = "url"): void {
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

  if (isBlockedHost(parsed.hostname)) {
    throw Errors.validation(
      `${fieldName} must not target private, loopback, or cloud-metadata addresses`,
    );
  }
}
