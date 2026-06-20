/**
 * Structured JSON logger with secret redaction. Logs are single-line JSON so
 * they are machine-parseable. Sensitive fields are redacted recursively before
 * anything is written — secrets must never reach the log sink.
 */

import { isAppError } from "@/lib/errors";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Field names whose values are always redacted (case-insensitive substring). */
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "auth",
  "cookie",
  "credential",
  "private",
  "x-payment",
  "x_payment",
  "connectionstring",
  "database_url",
  "dburl",
];

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 8;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Recursively redact sensitive values. Cycles are broken with a marker, and
 * depth is bounded to avoid pathological structures.
 */
export function redact(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (seen.has(value as object)) return "[CIRCULAR]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(isAppError(value) ? { code: value.code } : {}),
    };
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(val, seen, depth + 1);
  }
  return out;
}

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Return a child logger that merges `bindings` into every record. */
  child(bindings: LogContext): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  bindings?: LogContext;
  /** Sink for serialized records. Defaults to stdout/stderr. */
  sink?: (level: LogLevel, line: string) => void;
}

function defaultSink(level: LogLevel, line: string): void {
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

function resolveLevel(explicit?: LogLevel): LogLevel {
  const candidate = explicit ?? process.env.LOG_LEVEL;
  return (LOG_LEVELS as readonly string[]).includes(candidate ?? "")
    ? (candidate as LogLevel)
    : "info";
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = resolveLevel(options.level);
  const bindings = options.bindings ?? {};
  const sink = options.sink ?? defaultSink;

  function write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;
    const record = {
      level,
      time: new Date().toISOString(),
      message,
      ...(redact(bindings) as LogContext),
      ...(context ? (redact(context) as LogContext) : {}),
    };
    sink(level, JSON.stringify(record));
  }

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context),
    child: (childBindings) =>
      createLogger({
        level: minLevel,
        bindings: { ...bindings, ...childBindings },
        sink,
      }),
  };
}

/** Process-wide default logger. Prefer `.child()` to attach request context. */
export const logger = createLogger();
