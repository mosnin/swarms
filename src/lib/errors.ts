/**
 * Typed application error taxonomy. Every error carries a stable `code`, an
 * HTTP status for the API surface, and a `retryable` hint. Errors serialize to
 * the standard API envelope via {@link AppError.toJSON} and never include
 * secrets or raw causes in their public shape.
 */

export const ErrorCode = {
  VALIDATION: "VALIDATION",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  POLICY_DENIED: "POLICY_DENIED",
  NOT_FOUND: "NOT_FOUND",
  CAPABILITY_NOT_FOUND: "CAPABILITY_NOT_FOUND",
  CONFLICT: "CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  RATE_LIMITED: "RATE_LIMITED",
  SANDBOX_FAILURE: "SANDBOX_FAILURE",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  CONFIG_ERROR: "CONFIG_ERROR",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  POLICY_DENIED: 403,
  NOT_FOUND: 404,
  CAPABILITY_NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PAYMENT_REQUIRED: 402,
  BUDGET_EXCEEDED: 402,
  RATE_LIMITED: 429,
  SANDBOX_FAILURE: 500,
  UPSTREAM_ERROR: 502,
  CONFIG_ERROR: 500,
  INTERNAL: 500,
};

const DEFAULT_RETRYABLE: Record<ErrorCode, boolean> = {
  VALIDATION: false,
  UNAUTHORIZED: false,
  FORBIDDEN: false,
  POLICY_DENIED: false,
  NOT_FOUND: false,
  CAPABILITY_NOT_FOUND: false,
  CONFLICT: false,
  IDEMPOTENCY_CONFLICT: false,
  PAYMENT_REQUIRED: false,
  BUDGET_EXCEEDED: false,
  RATE_LIMITED: true,
  SANDBOX_FAILURE: true,
  UPSTREAM_ERROR: true,
  CONFIG_ERROR: false,
  INTERNAL: false,
};

export interface AppErrorOptions {
  /** Override the default HTTP status for the code. */
  status?: number;
  /** Override the default retryable hint for the code. */
  retryable?: boolean;
  /** Safe, structured detail shown to the caller (must not contain secrets). */
  details?: Record<string, unknown>;
  /** Underlying cause kept server-side only; never serialized. */
  cause?: unknown;
}

/** Serialized, caller-safe representation of an error. */
export interface SerializedError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? DEFAULT_STATUS[code];
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE[code];
    this.details = options.details;
    // Maintain prototype chain when targeting ES build outputs.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Caller-safe envelope payload. Never includes `cause`. */
  toJSON(): SerializedError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** Type guard for {@link AppError}. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Normalize an unknown thrown value into an {@link AppError}. Unknown errors
 * collapse to `INTERNAL` with a generic message so internals never leak.
 */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  return new AppError(ErrorCode.INTERNAL, "Internal server error", { cause: value });
}

/* ------------------------------------------------------------------ */
/* Convenience constructors                                            */
/* ------------------------------------------------------------------ */

export const Errors = {
  validation: (message = "Validation failed", details?: Record<string, unknown>) =>
    new AppError(ErrorCode.VALIDATION, message, { details }),
  unauthorized: (message = "Authentication required") =>
    new AppError(ErrorCode.UNAUTHORIZED, message),
  forbidden: (message = "Forbidden", details?: Record<string, unknown>) =>
    new AppError(ErrorCode.FORBIDDEN, message, { details }),
  policyDenied: (message = "Denied by policy", details?: Record<string, unknown>) =>
    new AppError(ErrorCode.POLICY_DENIED, message, { details }),
  notFound: (message = "Not found") => new AppError(ErrorCode.NOT_FOUND, message),
  conflict: (message = "Conflict", details?: Record<string, unknown>) =>
    new AppError(ErrorCode.CONFLICT, message, { details }),
  capabilityNotFound: (message = "Capability not found") =>
    new AppError(ErrorCode.CAPABILITY_NOT_FOUND, message),
  idempotencyConflict: (message = "Idempotency key reused with a different request") =>
    new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, message),
  paymentRequired: (message = "Payment required", details?: Record<string, unknown>) =>
    new AppError(ErrorCode.PAYMENT_REQUIRED, message, { details }),
  budgetExceeded: (message = "Budget exceeded", details?: Record<string, unknown>) =>
    new AppError(ErrorCode.BUDGET_EXCEEDED, message, { details }),
  rateLimited: (message = "Rate limit exceeded") => new AppError(ErrorCode.RATE_LIMITED, message),
  sandboxFailure: (message = "Sandbox execution failed", cause?: unknown) =>
    new AppError(ErrorCode.SANDBOX_FAILURE, message, { cause }),
  upstream: (message = "Upstream call failed", cause?: unknown) =>
    new AppError(ErrorCode.UPSTREAM_ERROR, message, { cause }),
  config: (message = "Invalid configuration", cause?: unknown) =>
    new AppError(ErrorCode.CONFIG_ERROR, message, { cause }),
  internal: (message = "Internal server error", cause?: unknown) =>
    new AppError(ErrorCode.INTERNAL, message, { cause }),
} as const;
