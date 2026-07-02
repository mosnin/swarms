/** @type {import('next').NextConfig} */

/**
 * Comprehensive security headers applied to all page responses.
 * API routes get their own CORS policy via the /api/v1 matcher.
 *
 * CSP notes:
 *  - 'unsafe-inline' on script-src is required by Next.js 15 App Router for
 *    its inline hydration bootstrap scripts. Remove it once Next.js ships
 *    nonce-based CSP support for App Router (tracked upstream).
 *  - frame-ancestors 'none' replaces X-Frame-Options at the CSP level
 *    (kept in both places for legacy browser compatibility).
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const pageSecurityHeaders = [
  // Force HTTPS for 2 years, include subdomains, opt into HSTS preload list.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Prevent the browser from sniffing MIME types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Deny embedding in iframes (clickjacking protection).
  { key: "X-Frame-Options", value: "DENY" },
  // Limit referrer information sent cross-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features we don't use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()",
  },
  // Full content security policy (see note above).
  { key: "Content-Security-Policy", value: csp },
  // Opt out of Google's FLoC / Topics.
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/**
 * CORS policy for the public v1 API surface.
 * The API is authenticated exclusively via Bearer tokens (not cookies), so
 * Access-Control-Allow-Origin: * is safe — credentials are never implicit.
 */
const apiCorsHeaders = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  {
    key: "Access-Control-Allow-Methods",
    value: "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  },
  {
    key: "Access-Control-Allow-Headers",
    value: "Content-Type, Authorization, X-Request-ID, Idempotency-Key",
  },
  { key: "Access-Control-Max-Age", value: "86400" },
  // Never cache the CORS headers at a CDN layer that could leak to other orgs.
  { key: "Vary", value: "Origin" },
];

const nextConfig = {
  reactStrictMode: true,
  // Keep server-only packages out of the client bundle.
  serverExternalPackages: ["postgres"],

  async headers() {
    return [
      // Security headers on all non-API pages.
      {
        source: "/((?!api/).*)",
        headers: pageSecurityHeaders,
      },
      // CORS for the public v1 API (agents call this cross-origin).
      {
        source: "/api/v1/:path*",
        headers: apiCorsHeaders,
      },
    ];
  },
};

export default nextConfig;
