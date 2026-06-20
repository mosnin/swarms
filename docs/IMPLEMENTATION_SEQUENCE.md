# Hermes Cloud — Implementation Sequence

> Status: Draft v0.1. Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md),
> [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md), and
> [`SECURITY_MODEL.md`](./SECURITY_MODEL.md).

Build order is chosen so that **safety primitives precede anything that spends
money or runs code**. Each phase has explicit exit criteria; do not start a
phase until the previous phase's criteria are met. No phase ships toy
placeholder architecture except adapters explicitly marked `// LOCAL DEV ADAPTER`.

## Phase 0 — Foundation & repo standards  ◀ current task

Scope: project scaffolding and the shared primitives every later module depends
on. **No product/business logic.**

Deliverables:
- Next.js App Router + TypeScript strict, Tailwind, shadcn/ui, ESLint, Prettier.
- `src/lib/env.ts` — Zod-validated environment loader (fail-fast).
- `src/lib/result.ts` — typed `Result<T, E>` success/failure helpers.
- `src/lib/errors.ts` — typed application error taxonomy.
- `src/lib/logger.ts` — structured logging with secret redaction.
- `src/lib/authz.ts` — permission-checking primitives.
- `src/lib/idempotency.ts` — idempotency key validation helpers.
- `src/lib/time.ts` — time helpers (UTC, monotonic, `now()` seam for tests).
- `src/lib/money.ts` — money in integer minor units only.
- `app/api/health/route.ts` and `app/api/ready/route.ts`.
- Vitest unit tests (env, money, result, idempotency); Playwright if practical.

Exit criteria:
- [ ] `npm run build` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run test` passes.
- [ ] App fails fast when required env vars are missing.
- [ ] No money calculation uses floating point.

## Phase 1 — Persistence & identity

- Drizzle schema + migrations for `organizations`, `principals`, `api_keys`,
  `idempotency_keys`, `audit_log` (append-only).
- Postgres client wiring (local Docker adapter), migration scripts in CI.
- AuthN: API key hashing/verification; request context (principal, org, scopes).
- `authz` guard wired as the single mutation choke point.

Exit: a request can be authenticated, scoped to an org, and audited; deny-path
tests pass; migrations run forward-only in CI.

## Phase 2 — Catalog & capability resolution

- Tables + services for `skills`/`skill_versions`, `connectors`/`bindings`,
  `swarms`/`swarm_versions`.
- Publish/deprecate/yank lifecycle with immutable published versions.
- Capability resolver: intent → pinned capability version, Zod-validated.

Exit: an intent resolves deterministically to a priced, published version;
unauthorized publish/resolve is denied; lifecycle transitions are audited.

## Phase 3 — Budgets, ledger & x402 payment

- `budgets`, `budget_reservations`, `ledger_entries` (append-only, double-entry),
  `receipts`.
- Reservation (hold) → capture/release flow; hard-stop enforcement.
- `PaymentProvider` port + x402 challenge/settle; **local mock adapter**.
- Idempotent charging proven by double-submit test (no double-charge).

Exit: a priced action can be funded via balance or x402; receipts + ledger
reconcile; exactly-once capture under retries.

## Phase 4 — Execution engine & queue

- `jobs`, `job_events` (append-only), `metering_events`.
- `JobQueue` port + Postgres `SKIP LOCKED` local adapter.
- Full execution lifecycle (validate→resolve→authorize→price→fund→create→
  enqueue) in the control plane; idempotent job creation.

Exit: submitting an intent creates exactly one durable, idempotent job and
enqueues it; crash-safe state transitions; cancellation/timeout release holds.

## Phase 5 — Workers & sandbox runtime

- Standalone worker process (not Next.js) claiming jobs via lease.
- `SandboxRuntime` port + isolated local adapter (container/VM); per-job secret
  injection; resource/time limits; egress controls.
- Result intake on `/internal/jobs/:id/result`; output validated against
  `outputSchema`; metering recorded; reservation captured; receipt issued.

Exit: a job runs end-to-end in a sandbox and returns a structured result with a
receipt and audit trail; no code runs in a request handler.

## Phase 6 — Swarms

- Swarm provisioning: per-member isolated sandboxes, mediated message bus,
  per-member metering, aggregate budget enforcement, declared failure policy.

Exit: a swarm executes its topology within budget and produces a rolled-up
receipt with per-member metering.

## Phase 7 — Hardening & operability

- Rate limiting, anomaly logging, secret scanning + dependency audit in CI.
- Observability: structured logs, metrics, traces; reconciliation jobs.
- Backup/PITR, runbooks, incident response, load/chaos testing.

Exit: all commercial-grade acceptance criteria (below) are green.

## Commercial-grade acceptance criteria (release gate)

Mirrors ARCHITECTURE §12 and SECURITY_MODEL §10:

- [ ] TypeScript strict; CI fails on type errors; no `any` at boundaries.
- [ ] Every API boundary Zod-validated (request + response).
- [ ] Every mutation passes server-side `authz` (deny-path test-proven).
- [ ] Every paid action requires + enforces an idempotency key (no double-charge).
- [ ] Every execution has an append-only audit trail + metering events.
- [ ] No arbitrary code executes inside a Next.js request handler.
- [ ] No secrets in code/VCS; config validated at boot; secret scanning in CI.
- [ ] Postgres is system of record; queue/cache reconstructable.
- [ ] Every external call has timeouts, backoff retries, and typed errors.
- [ ] Every important entity has `createdAt` + `updatedAt`.
- [ ] Money is integer minor units; ledger double-entry + append-only.
- [ ] Migrations versioned, forward-only, reviewed.

## Definition of done (per change)

1. Types check under strict mode; lint + format clean.
2. Unit tests for logic; integration tests for mutations (incl. deny path).
3. Zod validation at every new boundary.
4. Audit + metering emitted for new mutations/executions.
5. Docs updated when contracts change (this folder is the source of truth).
