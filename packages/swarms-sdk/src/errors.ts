/**
 * Typed SDK errors. Every non-2xx response (except the x402 402 handled
 * explicitly) surfaces as a {@link SwarmsError} carrying the server's
 * stable error code, HTTP status, and a `retryable` hint — never the API key.
 */

export interface SwarmsErrorShape {
  code: string;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export class SwarmsError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: SwarmsErrorShape) {
    super(body.message || `Request failed with status ${status}`);
    this.name = "SwarmsError";
    this.code = body.code || "UNKNOWN";
    this.status = status;
    this.retryable = body.retryable ?? status >= 500;
    this.details = body.details;
  }
}

/** Network/transport failure before a response was received. */
export class SwarmsNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "SwarmsNetworkError";
  }
}
