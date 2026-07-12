/**
 * Shared HTTP helpers for App Router route handlers. Provides the standard
 * success/error envelope and a wrapper that maps thrown {@link AppError}s (and
 * unknown errors) to the correct status code without leaking internals.
 */

import { NextResponse } from "next/server";

import { ErrorCode, Errors, isAppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Default maximum accepted JSON request body (256 KB) for API mutations. */
export const MAX_JSON_BODY_BYTES = 256 * 1024;

/**
 * Read and parse a JSON request body with a hard size cap, so a caller cannot
 * force the server to buffer an unbounded payload before Zod validation (a
 * memory-pressure vector on self-hosted deployments without a platform cap).
 * Rejects oversized bodies with a typed VALIDATION error; returns `null` on
 * malformed JSON (callers already treat that as a 400).
 */
export async function readJsonBody(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw Errors.validation(`Request body exceeds the ${maxBytes}-byte limit`);
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw Errors.validation(`Request body exceeds the ${maxBytes}-byte limit`);
  }
  try {
    return text.length === 0 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function errorResponse(error: unknown): NextResponse {
  const appError = toAppError(error);

  // 5xx are unexpected — log with the (redacted) cause for diagnosis.
  if (appError.status >= 500) {
    logger.error("Request failed", { code: appError.code, cause: appError.cause });
  } else if (!isAppError(error)) {
    logger.warn("Non-AppError surfaced from handler", { code: appError.code });
  }

  const headers: Record<string, string> = {};

  // RFC 6585 §4 / RFC 7231 §7.1.3 — include Retry-After on 429 responses.
  // The retryAtMs detail is set by the rate limiter; fall back to 60 seconds.
  if (appError.code === ErrorCode.RATE_LIMITED) {
    const retryAtMs =
      typeof appError.details?.retryAtMs === "number" ? appError.details.retryAtMs : null;
    const retryInSeconds =
      retryAtMs !== null ? Math.max(1, Math.ceil((retryAtMs - Date.now()) / 1000)) : 60;
    headers["Retry-After"] = String(retryInSeconds);
  }

  return NextResponse.json({ error: appError.toJSON() }, { status: appError.status, headers });
}

/** Wrap a route handler so thrown errors become the standard error envelope. */
export async function route(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    return errorResponse(error);
  }
}
