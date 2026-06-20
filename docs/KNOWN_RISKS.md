# Known Risks

Honest, tracked list of risks that are **not fully resolved**. Each is a
GitHub-issue-style note. Nothing here is hidden behind a silent TODO.

## Critical (block the corresponding launch level)

### KR-1 — No production-safe sandbox for untrusted code
- **Impact**: untrusted third-party skill code cannot be run safely.
- **Status**: interface + dev stub only; stub refuses to execute; selector fails
  closed in production. Evidence: `src/server/sandbox/*`, `docs/SANDBOX_RUNTIME.md`.
- **Blocks**: public marketplace (Phase 22).
- **Fix**: implement a microVM/gVisor/remote-exec provider meeting all
  requirements in SANDBOX_RUNTIME.md; pass an isolation test suite.

### KR-2 — Mainnet x402 not production-hardened
- **Impact**: real-money settlement is not verified end-to-end.
- **Status**: mock testnet provider; real provider selection **fails closed**
  until a facilitator adapter is wired + configured. Evidence:
  `src/server/payments/config.ts`.
- **Blocks**: mainnet production (Phase 21).
- **Fix**: wire the real x402 adapter, add monitoring, run replay/duplicate tests
  against it.

## High

### KR-3 — Rate limiting is single-instance only
- **Impact**: token-bucket limits are enforced per process; multiple web
  replicas do not share state, so the effective limit scales with replica count.
- **Status**: **mitigated** — token-bucket limiter wired into `execute`,
  `execute-paid`, `swarms/run`, `connectors/call`. Evidence:
  `src/server/ratelimit/*`, `tokenBucket.test.ts`. Downgraded from "missing".
- **Fix (production)**: back the `RateLimiter` port with a shared store (Redis)
  for cross-instance limits.

### KR-4 — Multi-worker job claiming — RESOLVED
- **Status**: **resolved** — `claimAndProcessJobs` uses
  `SELECT ... FOR UPDATE SKIP LOCKED` to atomically claim queued jobs, so worker
  replicas never grab the same job. Evidence: `src/modules/execution/worker.ts`,
  `processJob({ preClaimed })`, `processJob.test.ts`.

### KR-5 — Stuck-job reaper — RESOLVED
- **Status**: **resolved** — `reapExpiredJobs` fails jobs running past
  `WORKER_MAX_RUN_MS`, releases their budget hold, and audits. Runs periodically
  in the worker loop. Evidence: `src/modules/execution/worker.ts`,
  `apps/worker/index.ts`.

## Medium

### KR-6 — Budget types beyond org/period not fully enforced
- **Status**: budget rows model multiple scopes (api_key_daily, etc.); the active
  enforced path is org budgets per period. Per-key/connector budgets are modeled
  but not all wired into checks.
- **Fix**: extend `checkBudget` to evaluate the budget `scope`.

### KR-7 — No automated DB backups / down-migrations
- **Status**: forward-only migrations; backup/PITR + rollback are operational
  tasks not automated in-repo. Evidence: `DEPLOYMENT_TOPOLOGY.md`.
- **Fix**: managed Postgres PITR + documented restore runbook.

### KR-8 — Connector broker + secret mounting are design-level
- **Status**: connectors are mock; secrets stored by reference/encrypted; the
  broker that mediates real connector secrets for a sandbox is specified but not
  built (no real connectors or sandbox yet).
- **Fix**: implement the broker alongside the real sandbox.

## Low / Info

### KR-9 — Streaming logs is a polling placeholder
- SDK `streamJobLogs` polls; a real SSE/WebSocket transport is future work.

### KR-10 — No external observability sink
- Structured logs + request IDs exist; shipping to a metrics/trace backend is
  not configured.

### KR-11 — Artifact scanning is a placeholder
- The sandbox interface collects + hashes artifacts; the scanner is a stub.
