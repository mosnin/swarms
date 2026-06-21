# Known Risks

Honest, tracked list. Each is a GitHub-issue-style note. Nothing is hidden
behind a silent TODO. Items resolved during hardening are kept with **RESOLVED**
status + evidence.

## Critical (block the corresponding launch level)

### KR-1 — Sandbox: container provider shipped; microVM recommended for fully untrusted code
- **Status**: a **real container sandbox** (`DockerSandboxProvider`) is
  implemented and selectable via `SANDBOX_PROVIDER=docker|podman` — no network,
  read-only root, tmpfs workdir, dropped caps, no-new-privileges, non-root,
  enforced cpu/mem/pids/time, no host secrets. `isProductionSafe = true`.
  Evidence: `src/server/sandbox/dockerSandboxProvider.ts` + tests.
- **Residual**: containers share the host kernel; for **fully untrusted
  multi-tenant** marketplace code a microVM (Firecracker) / gVisor is stronger.
  The provider interface accepts such an adapter unchanged.
- **Operational**: requires a container engine + a built skill-runtime image on
  the worker host.

### KR-2 — Mainnet x402 not production-hardened
- **Impact**: real-money settlement is not verified end-to-end.
- **Status**: mock testnet provider; real provider selection **fails closed**
  until a facilitator adapter is wired + configured. Evidence:
  `src/server/payments/config.ts`.
- **Blocks**: mainnet production (Phase 21).
- **Fix**: wire the real x402 adapter (needs a real facilitator/wallet), add
  monitoring, run replay/duplicate tests against it.

## Resolved during hardening

### KR-3 — Rate limiting — RESOLVED (memory + distributed)
- **Status**: token-bucket (in-process) AND a Postgres shared-store adapter
  (`RATE_LIMIT_BACKEND=postgres`) wired into `execute`, `execute-paid`,
  `swarms/run`, `connectors/call`. Multi-instance limits hold via
  `rate_limit_counters`. Evidence: `src/server/ratelimit/*`, `tokenBucket.test.ts`,
  `tests/integration/ratelimit-pg.test.ts`.

### KR-4 — Multi-worker job claiming — RESOLVED
- **Status**: `claimAndProcessJobs` uses `SELECT ... FOR UPDATE SKIP LOCKED`.
  Evidence: `worker.ts`, `processJob({ preClaimed })`,
  `tests/integration/worker-claim.test.ts`.

### KR-5 — Stuck-job reaper — RESOLVED
- **Status**: `reapExpiredJobs` fails over-running jobs, releases holds, audits.
  Evidence: `worker.ts`, `apps/worker/index.ts`.

### KR-6 — Per-key / per-skill budget scopes — RESOLVED
- **Status**: `checkBudget` is scope-aware (`budgetApplies` + `scopedEntriesSince`
  join ledger→jobs→skill_versions). Evidence: `src/server/budget/scope.ts`,
  `tests/integration/budget-scope.test.ts`.

### KR-9 — Webhook delivery — RESOLVED
- **Status**: durable outbox (`webhook_deliveries`), HMAC-signed canonical
  bodies, at-least-once delivery with backoff in the worker. Evidence:
  `src/modules/webhooks/*`, `docs/WEBHOOKS.md`,
  `tests/integration/webhooks.test.ts`. (SDK log *streaming* is still a poll
  placeholder.)

## Medium / operational (require infra config, not code)

### KR-7 — Automated DB backups / down-migrations
- **Status**: policy + restore procedure documented (`docs/BACKUPS.md`); the repo
  does not provision infra. Forward-only migrations; rollback = PITR restore.
- **Fix**: enable managed Postgres PITR per BACKUPS.md.

### KR-8 — Connector broker + secret mounting are design-level
- **Status**: connectors are mock; secrets stored by reference/encrypted; the
  broker that mediates real connector secrets for a sandbox is specified but not
  built (no real connectors or sandbox yet).
- **Fix**: implement the broker alongside the real sandbox (KR-1).

### KR-10 — External observability sink
- **Status**: structured logs + request IDs + a swappable **metrics sink**
  (`src/lib/metrics.ts`, default log adapter) exist. Shipping to an OTEL/StatsD
  backend is a config/adapter step.
- **Fix**: add a production metrics adapter + log/trace shipping.

## Low / Info

### KR-11 — Artifact scanning is a placeholder
- The sandbox interface collects + hashes artifacts; the scanner is a stub
  (moot until a real sandbox exists).

## Note on the queue

The durable execution path does **not** depend on the in-memory queue: the
worker claims `queued` rows directly from Postgres (`FOR UPDATE SKIP LOCKED`), so
Postgres *is* the durable queue. The in-memory `LocalQueue` is only a dev signal
(and the dev drain endpoint). An external broker remains optional behind the
`JobQueue` port.
