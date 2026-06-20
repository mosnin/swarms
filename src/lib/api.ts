/**
 * Shared HTTP helpers for App Router route handlers. Provides the standard
 * success/error envelope and a wrapper that maps thrown {@link AppError}s (and
 * unknown errors) to the correct status code without leaking internals.
 */

import { NextResponse } from "next/server";

import { isAppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

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
  return NextResponse.json({ error: appError.toJSON() }, { status: appError.status });
}

/** Wrap a route handler so thrown errors become the standard error envelope. */
export async function route(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    return errorResponse(error);
  }
}
