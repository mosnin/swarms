/**
 * Next.js Edge Middleware — request-level security layer.
 *
 * Responsibilities:
 *  1. CORS preflight (OPTIONS) for /api/v1/** — so browsers can discover
 *     allowed methods/headers without hitting the actual route handler.
 *  2. X-Request-ID — generate a correlation ID for every request and echo
 *     it back on the response so clients can match logs.
 *
 * Security notes:
 *  - CORS * is intentional: the v1 API uses Bearer tokens, not cookies, so
 *    wildcard origin does not expose session credentials.
 *  - The x-request-id echo is safe: we validate the incoming value and fall
 *    back to a server-generated UUID when absent or malformed.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REQUEST_ID_HEADER = "x-request-id";

const CORS_ALLOW_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS";
const CORS_ALLOW_HEADERS =
  "Content-Type, Authorization, X-Request-ID, Idempotency-Key";
const CORS_MAX_AGE = "86400";

function deriveRequestId(request: NextRequest): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER);
  // Accept only safe, bounded strings — reject anything that looks crafted.
  if (incoming && /^[A-Za-z0-9._:\-]{1,128}$/.test(incoming)) return incoming;
  // Fallback: generate a new ID. We cannot use `randomUUID()` in the Edge
  // runtime directly, but `crypto.randomUUID()` is available globally there.
  return `req_${crypto.randomUUID()}`;
}

export function middleware(request: NextRequest): NextResponse {
  const requestId = deriveRequestId(request);
  const isApiV1 = request.nextUrl.pathname.startsWith("/api/v1");

  // Handle CORS preflight for the public API.
  if (request.method === "OPTIONS" && isApiV1) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
        "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
        "Access-Control-Max-Age": CORS_MAX_AGE,
        [REQUEST_ID_HEADER]: requestId,
      },
    });
  }

  // Forward the (possibly generated) request ID to the route handler so it
  // can be embedded in log lines and audit events.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Echo the correlation ID on every response.
  response.headers.set(REQUEST_ID_HEADER, requestId);

  return response;
}

export const config = {
  // Run on all routes except Next.js static assets and image optimization.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
