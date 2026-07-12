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

  // Shared secret for the /api/internal/* endpoints. The standalone worker
  // sends this in the x-internal-secret header. Required in production to
  // prevent external callers from triggering job processing.
  INTERNAL_WORKER_SECRET: z.string().min(32).optional(),

  // HMAC secret for signing human dashboard session cookies. Without a valid
  // signature the cookie value cannot be trusted as an identity. Required in
  // production; a fixed dev secret is used otherwise.
  SESSION_SECRET: z.string().min(32).optional(),

  // OAuth 2.0 (authorization-code + PKCE) login. Provider-agnostic: point these
  // at any compliant IdP (Auth0, Okta, Google, Keycloak, ...). When AUTH_MODE is
  // "oauth" in production these are required; in "dev" mode the dev-login route
  // is used instead. See src/server/auth/oauth.ts.
  AUTH_MODE: z.enum(["dev", "oauth"]).default("dev"),
  OAUTH_CLIENT_ID: z.string().min(1).optional(),
  OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  OAUTH_AUTHORIZE_URL: z.string().url().optional(),
  OAUTH_TOKEN_URL: z.string().url().optional(),
  OAUTH_USERINFO_URL: z.string().url().optional(),
  OAUTH_REDIRECT_URL: z.string().url().optional(),
  OAUTH_SCOPES: z.string().min(1).default("openid email profile"),
  // Human-readable name of the IdP, shown on the sign-in button (e.g. "Clerk",
  // "Google"). Purely cosmetic; the flow is provider-agnostic regardless.
  AUTH_PROVIDER_LABEL: z.string().min(1).default("your identity provider"),

  // Rate-limit backend: in-process (single instance) or shared Postgres.
  RATE_LIMIT_BACKEND: z.enum(["memory", "postgres"]).default("memory"),

  // Sandbox provider: dev stub (no isolation) or a real container engine.
  SANDBOX_PROVIDER: z.enum(["stub", "docker", "podman"]).default("stub"),
  SANDBOX_IMAGE: z.string().min(1).default("ghcr.io/swarms/skill-runtime:latest"),

  // AES-256-GCM data key (base64, 32 bytes) for encrypting connector secrets +
  // resource bundles at rest. Required in production; a fixed dev key otherwise.
  CONNECTOR_ENCRYPTION_KEY: z.string().min(1).optional(),

  // Spawned-agent runtime: deterministic mock (dev/test), the in-process
  // OpenAI Agents SDK harness (openrouter), or that same harness running inside
  // a Modal sandbox (modal) — the one production compute provider.
  AGENT_RUNTIME: z.enum(["mock", "openrouter", "modal"]).default("mock"),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  AGENT_DEFAULT_MODEL: z.string().min(1).default("deepseek/deepseek-chat-v4"),

  // Modal compute: the deployed web endpoint that runs the agent harness in a
  // sandbox, and its bearer token. Required when AGENT_RUNTIME=modal.
  MODAL_RUN_URL: z.string().url().optional(),
  MODAL_TOKEN: z.string().min(1).optional(),

  // GPU compute pricing for agent labor (integer minor units per GPU-second).
  GPU_RATE_MINOR_PER_SECOND: z.coerce.number().int().nonnegative().default(2),
  GPU_RATE_CURRENCY: z.string().length(3).default("USD"),

  // Simulations: flat base fee per spawned agent (integer minor units), charged
  // on top of metered GPU-seconds. Default 25 = $0.25/agent.
  SIMULATION_AGENT_BASE_MINOR: z.coerce.number().int().nonnegative().default(25),
  // Modal endpoint that runs the CrewAI crew (the /simulate app). Optional: when
  // unset it is derived from MODAL_RUN_URL by swapping the trailing /run.
  MODAL_SIMULATE_URL: z.string().url().optional(),

  // Object storage for run artifacts (reports, transcripts, exports). `db` is a
  // LOCAL DEV ADAPTER that stores bytes in Postgres; `s3` targets any
  // S3-compatible bucket (AWS S3, Cloudflare R2) via the settings below.
  OBJECT_STORE_PROVIDER: z.enum(["db", "s3"]).default("db"),
  OBJECT_STORE_BUCKET: z.string().min(1).optional(),
  OBJECT_STORE_REGION: z.string().min(1).default("auto"),
  OBJECT_STORE_ENDPOINT: z.string().url().optional(), // R2 / MinIO custom endpoint
  OBJECT_STORE_ACCESS_KEY_ID: z.string().min(1).optional(),
  OBJECT_STORE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  // Max artifact size accepted (bytes) and default retention (days, 0 = keep).
  ARTIFACT_MAX_BYTES: z.coerce.number().int().positive().default(26_214_400), // 25 MiB
  ARTIFACT_RETENTION_DAYS: z.coerce.number().int().nonnegative().default(90),

  // Auto-reload top-up provider: the seam that captures money from an org's
  // saved method when its balance runs low. `mock` always succeeds (dev/test);
  // `none` disables auto-reload capture entirely (attempts are recorded failed).
  // Production wires a real processor adapter here.
  TOPUP_PROVIDER: z.enum(["mock", "none"]).default("mock"),

  // Cost anomaly detection: alert when a settled charge exceeds `factor`× the
  // trailing average charge for the org (over the last `window` charges) and is
  // above the `min` floor (so trivial charges never alarm). 0 factor disables.
  COST_ANOMALY_FACTOR: z.coerce.number().nonnegative().default(4),
  COST_ANOMALY_MIN_MINOR: z.coerce.number().int().nonnegative().default(100),
  COST_ANOMALY_WINDOW: z.coerce.number().int().positive().default(20),
}).superRefine((data, ctx) => {
  // Whenever the S3 object-store adapter is selected, its bucket + credentials
  // must be present — otherwise every artifact upload 500s lazily. Enforced in
  // all environments (you can select s3 in dev too), not just production.
  if (data.OBJECT_STORE_PROVIDER === "s3") {
    for (const key of ["OBJECT_STORE_BUCKET", "OBJECT_STORE_ACCESS_KEY_ID", "OBJECT_STORE_SECRET_ACCESS_KEY"] as const) {
      if (!data[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: "Required when OBJECT_STORE_PROVIDER=s3" });
      }
    }
  }
  // In production, all secrets that are "optional" in dev must be present.
  // Lazy failures (first use of crypto/webhook signing) are unacceptable for
  // a paid execution layer — fail fast at boot instead.
  if (data.NODE_ENV === "production") {
    if (!data.API_KEY_PEPPER) {
      ctx.addIssue({ code: "custom", path: ["API_KEY_PEPPER"], message: "Required in production" });
    }
    if (!data.WEBHOOK_SIGNING_SECRET) {
      ctx.addIssue({ code: "custom", path: ["WEBHOOK_SIGNING_SECRET"], message: "Required in production" });
    }
    if (!data.CONNECTOR_ENCRYPTION_KEY) {
      ctx.addIssue({ code: "custom", path: ["CONNECTOR_ENCRYPTION_KEY"], message: "Required in production" });
    }
    if (!data.INTERNAL_WORKER_SECRET) {
      ctx.addIssue({ code: "custom", path: ["INTERNAL_WORKER_SECRET"], message: "Required in production" });
    }
    // The in-process "memory" rate-limit backend cannot enforce a global limit
    // across a serverless/horizontally-scaled fleet (each instance has its own
    // Map), so the paid/expensive endpoints would be effectively unlimited.
    // Require the shared Postgres backend in production.
    if (data.RATE_LIMIT_BACKEND !== "postgres") {
      ctx.addIssue({
        code: "custom",
        path: ["RATE_LIMIT_BACKEND"],
        message:
          "In production, RATE_LIMIT_BACKEND must be 'postgres': the 'memory' backend is per-process and cannot enforce limits across multiple instances",
      });
    }
    // A paid execution layer must fail fast if real settlement is selected but
    // its receiver/facilitator are unset — otherwise the deploy boots green and
    // every paid job 500s at settlement time (getPaymentProvider throws lazily).
    if (data.X402_PROVIDER === "x402") {
      if (!data.X402_PAY_TO_ADDRESS) {
        ctx.addIssue({ code: "custom", path: ["X402_PAY_TO_ADDRESS"], message: "Required when X402_PROVIDER=x402" });
      }
      if (!data.X402_FACILITATOR_URL) {
        ctx.addIssue({ code: "custom", path: ["X402_FACILITATOR_URL"], message: "Required when X402_PROVIDER=x402" });
      }
    }
    if (!data.SESSION_SECRET) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "Required in production" });
    }
    // When production login is OAuth, the provider endpoints + client creds are
    // mandatory (a misconfigured IdP must fail at boot, not on first sign-in).
    if (data.AUTH_MODE === "oauth") {
      const required = [
        "OAUTH_CLIENT_ID",
        "OAUTH_CLIENT_SECRET",
        "OAUTH_AUTHORIZE_URL",
        "OAUTH_TOKEN_URL",
        "OAUTH_USERINFO_URL",
        "OAUTH_REDIRECT_URL",
      ] as const;
      for (const key of required) {
        if (!data[key]) {
          ctx.addIssue({ code: "custom", path: [key], message: "Required when AUTH_MODE=oauth" });
        }
      }
    }
    // Untrusted agent + caller-supplied tool code must run isolated in
    // production. Only `modal` (remote sandbox) actually isolates agent
    // execution: the `openrouter` runtime runs the agent loop in-process and the
    // `mock` runtime does no real work. SANDBOX_PROVIDER is NOT consulted on the
    // agent path (getSandboxProvider has no caller there), so it must not be
    // treated as an isolation escape hatch — require modal unconditionally.
    if (data.AGENT_RUNTIME !== "modal") {
      ctx.addIssue({
        code: "custom",
        path: ["AGENT_RUNTIME"],
        message:
          "In production, agent execution must run in an isolated sandbox: set AGENT_RUNTIME=modal (the openrouter/mock runtimes run untrusted code in-process and are not permitted in production)",
      });
    }
    if (data.AGENT_RUNTIME === "modal" && (!data.MODAL_RUN_URL || !data.MODAL_TOKEN)) {
      ctx.addIssue({
        code: "custom",
        path: ["MODAL_RUN_URL"],
        message: "MODAL_RUN_URL and MODAL_TOKEN are required when AGENT_RUNTIME=modal",
      });
    }
  }
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
