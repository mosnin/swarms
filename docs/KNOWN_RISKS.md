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

### Marketplace creator review — RESOLVED (in code)
- Public skills start `pending` and must be `approved` (`reviewSkill`,
  `skills.publish`) before they are listed in the marketplace or executable
  cross-org; rejected skills are blocked. Evidence: `skill-service.ts`,
  `POST /api/skills/[id]/review`, `tests/integration/marketplace-review.test.ts`.
  Production note: review is org-gated here; a platform-admin review tier is the
  full marketplace model.

### KR-2 — Mainnet x402: adapter implemented; needs a real facilitator + verification
- **Status**: a real `X402FacilitatorProvider` is implemented (verify/settle over
  HTTP, env-driven, fails closed, tested with a mock facilitator) and wired for
  `X402_PROVIDER=x402`. Evidence: `src/server/payments/x402Provider.ts`,
  `config.ts`.
- **Residual (deployment)**: point it at a real x402 facilitator on the target
  network, run the binding/replay/duplicate suite against that facilitator, and
  add payment monitoring before accepting real-money traffic.

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

### KR-7 — DB backups
- **Status**: `scripts/backup.sh` (pg_dump) + `scripts/restore.sh` (pg_restore)
  implemented; policy + restore procedure in `docs/BACKUPS.md`.
- **Residual (deployment)**: schedule the script (or enable managed PITR) and
  store dumps off-host with retention. Down-migrations remain intentionally
  absent (rollback = restore).

### KR-8 — Connector secret broker — RESOLVED (in code)
- **Status**: connector credentials are AES-256-GCM encrypted at rest
  (`src/lib/crypto/envelope.ts`) and decrypted only through the org-scoped
  `secretBroker` choke point (`src/server/connectors/secretBroker.ts`), never
  returned to clients. Tested. **Residual**: real connector implementations
  (current connectors are mocks) and `CONNECTOR_ENCRYPTION_KEY` via KMS.

### KR-10 — Observability sink — RESOLVED (in code)
- **Status**: swappable metrics sink (`src/lib/metrics.ts`) with a production
  **StatsD/DogStatsD adapter** (`src/lib/metrics-statsd.ts`, tested) plus
  structured logs + request IDs. **Residual (deployment)**: select the adapter
  and point it at your StatsD/OTEL backend.

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
