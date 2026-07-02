/**
 * Side-effecting env bootstrap for the smoke harness. Imported FIRST (before any
 * module that reads `@/lib/env`) so these defaults are in place by the time the
 * env schema validates at import time. ESM evaluates imported modules in source
 * order, so a bare `import "./_smoke-env"` ahead of the rest does the job.
 *
 * The injected PGlite test DB means DATABASE_URL is never actually dialed; it
 * only has to satisfy env validation.
 */
// NODE_ENV is left to env.ts (defaults to "development").
process.env.DATABASE_URL ??= "postgres://smoke:smoke@127.0.0.1:5432/smoke";
process.env.API_KEY_PEPPER ??= "smoke-pepper-0123456789abcdef";
// Must be base64-encoded 32 bytes (AES-256). Fixed dummy for the smoke run only.
process.env.CONNECTOR_ENCRYPTION_KEY ??= "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";
process.env.RATE_LIMIT_BACKEND ??= "memory";
process.env.AGENT_RUNTIME ??= "mock";
process.env.SANDBOX_PROVIDER ??= "stub";
