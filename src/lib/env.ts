/**
 * Environment variable validation layer. All configuration is validated with
 * Zod at process startup; the app **fails fast** with a clear message when a
 * required variable is missing or malformed. Never read `process.env` directly
 * elsewhere — import the validated {@link env} object instead.
 *
 * Secrets must never be hardcoded. Validation can be skipped only for tooling
 * that does not run the app (e.g. `next build`) via `SKIP_ENV_VALIDATION=true`.
 */

import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Postgres is the system of record — required in every runtime.
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      message: "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    }),

  // Optional pepper mixed into API-key hashing (HMAC). When absent, a plain
  // SHA-256 of the high-entropy key is used. Never the key itself.
  API_KEY_PEPPER: z.string().min(16).optional(),

  // LOCAL DEV ADAPTER: when no real session provider is wired, the dashboard
  // falls back to this user's email for the active session. Dev only.
  DEV_AUTH_USER_EMAIL: z.string().email().optional(),

  // Gate for the local_worker runner stub. Off by default; even when on, the
  // stub refuses to execute until a hardened sandbox provider exists.
  ENABLE_LOCAL_WORKER_RUNNER: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  // x402 payment configuration. All optional so local/dev uses the mock
  // provider; production wiring must supply these via the environment. The
  // receiving address is NEVER hardcoded — it comes from here or not at all.
  X402_PROVIDER: z.enum(["mock", "x402"]).default("mock"),
  X402_NETWORK: z.string().min(1).default("base-sepolia"),
  X402_PAY_TO_ADDRESS: z.string().min(1).optional(),
  X402_FACILITATOR_URL: z.string().url().optional(),
  X402_ASSET: z.string().min(1).optional(),

  // Marketplace platform fee in basis points (1/10000). Default 20%.
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(2000),

  // HMAC secret for signing outbound webhooks. Consumers verify with the same
  // secret. Optional in dev (a fixed dev secret is used); set in production.
  WEBHOOK_SIGNING_SECRET: z.string().min(16).optional(),

  // Rate-limit backend: in-process (single instance) or shared Postgres.
  RATE_LIMIT_BACKEND: z.enum(["memory", "postgres"]).default("memory"),

  // Sandbox provider: dev stub (no isolation) or a real container engine.
  SANDBOX_PROVIDER: z.enum(["stub", "docker", "podman"]).default("stub"),
  SANDBOX_IMAGE: z.string().min(1).default("ghcr.io/hermes-cloud/skill-runtime:latest"),

  // AES-256-GCM data key (base64, 32 bytes) for encrypting connector secrets +
  // resource bundles at rest. Required in production; a fixed dev key otherwise.
  CONNECTOR_ENCRYPTION_KEY: z.string().min(1).optional(),

  // Spawned-agent runtime: deterministic mock (dev/test) or a real agent on
  // OpenRouter (DeepSeek v4) driven by the OpenAI Agents SDK.
  AGENT_RUNTIME: z.enum(["mock", "openrouter"]).default("mock"),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  AGENT_DEFAULT_MODEL: z.string().min(1).default("deepseek/deepseek-chat-v4"),

  // GPU compute pricing for agent labor (integer minor units per GPU-second).
  GPU_RATE_MINOR_PER_SECOND: z.coerce.number().int().nonnegative().default(2),
  GPU_RATE_CURRENCY: z.string().length(3).default("USD"),
});

export type Env = z.infer<typeof envSchema>;

/** Raw input source for {@link parseEnv} (typically `process.env`). */
export type EnvSource = Record<string, string | undefined>;

/**
 * Validate an environment source. Throws an `Error` with a readable summary of
 * every invalid/missing variable on failure. Pure and side-effect free, so it
 * is safe to unit test directly.
 */
export function parseEnv(source: EnvSource): Env {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

function shouldSkipValidation(): boolean {
  const flag = process.env.SKIP_ENV_VALIDATION;
  return flag === "true" || flag === "1";
}

/**
 * Validated, immutable environment. Accessing this triggers eager validation at
 * import time (fail-fast) unless `SKIP_ENV_VALIDATION` is set for build tooling.
 */
export const env: Env = shouldSkipValidation()
  ? (process.env as unknown as Env)
  : Object.freeze(parseEnv(process.env));
