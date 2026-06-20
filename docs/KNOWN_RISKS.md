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

### KR-3 — No rate limiting on paid/job-creation endpoints
- **Impact**: a compromised key can spam job/payment creation (cost, DoS).
- **Status**: not implemented.
- **Blocks**: production (Phase 21).
- **Fix**: per-key/IP token-bucket on `execute`, `execute-paid`, `swarms/run`.

### KR-4 — Single-worker job claiming
- **Impact**: running multiple worker replicas can double-process a job under
  contention (processJob is idempotent on non-queued jobs, which bounds but does
  not eliminate this).
- **Status**: single-worker safe. Evidence: `pollQueuedJobs`, `WORKER_RUNTIME.md`.
- **Fix**: `SELECT ... FOR UPDATE SKIP LOCKED` claim or atomic `queued→running`.

### KR-5 — No stuck-job / lease reaper
- **Impact**: a worker crash mid-run can leave a job `running` and its budget
  hold outstanding.
- **Status**: `worker_runs.leaseExpiresAt` exists; no reaper yet.
- **Fix**: lease-based reaper that fails/retries expired runs and releases holds.

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
