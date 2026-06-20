# Hermes Cloud — Architecture

> Status: Draft v0.1 — technical plan. No product code implemented yet.
> Owner: Platform Engineering. Last updated: 2026-06-20.

Hermes Cloud is a paid **execution layer** for autonomous agents — an
*Agent Capability Cloud*. The local Hermes agent calls this platform to rent
**skills**, **connectors**, and sandboxed **agent workers (swarms)**. The
platform meters execution, enforces budgets and policies, stores audit logs,
and charges for usage through **x402**.

This document is the binding technical plan. It must stay consistent with:

- [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) — what we are building and why.
- [`SECURITY_MODEL.md`](./SECURITY_MODEL.md) — trust boundaries and risks.
- [`IMPLEMENTATION_SEQUENCE.md`](./IMPLEMENTATION_SEQUENCE.md) — build order
  and acceptance criteria.

---

## 1. System overview

### 1.1 The core loop

```
        ┌──────────────────────────────────────────────────────────────┐
        │                        Hermes Cloud                           │
        │                                                                │
 Intent │   ┌──────────┐   ┌────────────┐   ┌──────────┐   ┌─────────┐  │
────────┼──▶│  API /   │──▶│ Capability │──▶│ Policy + │──▶│   Job   │  │
 (HTTP) │   │ Gateway  │   │  Resolver  │   │  Budget  │   │ Creator │  │
        │   └──────────┘   └────────────┘   │ + Payment│   └────┬────┘  │
        │                                   └──────────┘        │       │
        │                                                       ▼       │
        │   ┌──────────┐   ┌────────────┐   ┌──────────┐   ┌─────────┐  │
 Result │   │ Receipts │◀──│   Audit /  │◀──│  Worker  │◀──│  Queue  │  │
◀───────┼───│ + Output │   │  Metering  │   │ (sandbox)│   │         │  │
        │   └──────────┘   └────────────┘   └──────────┘   └─────────┘  │
        │                                                                │
        └──────────────────────────────────────────────────────────────┘
```

1. **Intent enters through an API.** A signed request describes the capability
   the caller wants to invoke and the arguments.
2. **The platform resolves the requested capability** to a concrete, versioned
   skill / connector / swarm definition.
3. **It checks authorization, budget, payment, and policy** before any cost is
   incurred. Payment uses x402 when the caller has no prepaid balance.
4. **It creates an execution job** — a durable, idempotent record.
5. **Workers perform the job in isolated sandboxes**, never inside a Next.js
   request handler.
6. **The platform records logs, cost, outputs, and receipts.**
7. **Hermes receives structured results** — typed payload, cost, receipt id,
   and audit reference.

### 1.2 Architectural principles

- **Next.js is the control plane, not the execution plane.** Request handlers
  authorize, validate, persist, and enqueue. They never run untrusted code.
- **Postgres is the system of record.** Queues, caches, and object storage are
  derived/ephemeral and must be reconstructable from Postgres + receipts.
- **Everything mutating is server-authorized and idempotent.** No client is
  ever trusted for authorization, pricing, or balance.
- **Money and execution are append-only and auditable.** Ledger entries,
  receipts, and audit logs are never mutated in place.

### 1.3 Technology baseline

| Concern             | Choice                                                       |
| ------------------- | ------------------------------------------------------------ |
| Language            | TypeScript, `strict: true`                                   |
| Web framework       | Next.js App Router                                           |
| System of record    | Postgres                                                     |
| ORM / migrations    | Drizzle ORM + drizzle-kit                                    |
| Runtime validation  | Zod (every API boundary + every external response)           |
| Job transport       | Queue **abstraction** (`JobQueue` port; adapters below)      |
| Payments            | x402 (HTTP 402 settlement) over a `PaymentProvider` port     |
| Sandbox execution   | Worker service against a `SandboxRuntime` port               |
| AuthN               | API keys (machine) + session (human console), per request    |

---

## 2. Main modules

Code is organized by **domain module**, each exposing a service interface
(port) with swappable adapters. Proposed layout:

```
src/
  app/                      # Next.js App Router (control plane only)
    api/v1/                 # versioned HTTP surface (route handlers)
    (console)/              # human operator console (RSC)
  modules/
    identity/               # principals, API keys, sessions, orgs
    authz/                  # policy engine, scopes, server-side guards
    catalog/                # skills, connectors, swarms (definitions/versions)
    capability/             # resolver: intent -> concrete capability version
    budget/                 # budgets, spend limits, reservations
    payment/                # x402, ledger, receipts, idempotency
    execution/             # jobs, queue port, worker protocol, results
    audit/                  # append-only audit log + metering events
    connectors/             # external system bindings + secret refs
  lib/
    db/                     # drizzle client, schema, migrations
    queue/                  # JobQueue port + adapters (pg/local, sqs/redis)
    sandbox/                # SandboxRuntime port + adapters
    validation/             # shared Zod schemas
    errors/                 # typed error taxonomy + Result<T,E>
    config/                 # env loading + validation (no hardcoded secrets)
  worker/                   # standalone worker process (NOT Next.js)
docs/
```

| Module        | Responsibility                                                       |
| ------------- | -------------------------------------------------------------------- |
| `identity`    | Principals (org, user, agent), API keys, sessions, key rotation.     |
| `authz`       | Scope/policy evaluation; the single choke point for every mutation.  |
| `catalog`     | CRUD + versioning of skills, connectors, swarms; publish lifecycle.  |
| `capability`  | Resolve an intent to a concrete, pinned capability version.          |
| `budget`      | Budgets, reservations (holds), spend tracking, enforcement.          |
| `payment`     | x402 flow, double-entry ledger, receipts, idempotency registry.      |
| `execution`   | Job records, enqueue/dequeue, worker protocol, result intake.        |
| `audit`       | Append-only audit + metering events; immutable.                      |
| `connectors`  | External-system bindings; secret references (never raw secrets).     |

---

## 3. Data model draft

Conventions for **every** table:

- Surrogate `id` (UUID v7 for time-sortable keys).
- `createdAt timestamptz NOT NULL DEFAULT now()`.
- `updatedAt timestamptz NOT NULL DEFAULT now()` (trigger/app-maintained).
- Tenant scoping via `orgId` on every tenant-owned row.
- Money stored as integer minor units + ISO currency code (never floats).
- Ledger / audit / receipt tables are **append-only** (no UPDATE/DELETE).

```
organizations        (id, name, status, createdAt, updatedAt)
principals           (id, orgId, kind[user|agent|service], displayName,
                      status, createdAt, updatedAt)
api_keys             (id, orgId, principalId, hashedKey, prefix, scopes[],
                      lastUsedAt, expiresAt, revokedAt, createdAt, updatedAt)

skills               (id, orgId|null /*null = public*/, slug, name,
                      visibility, status, createdAt, updatedAt)
skill_versions       (id, skillId, semver, manifest jsonb, inputSchema jsonb,
                      outputSchema jsonb, pricing jsonb, status
                      [draft|published|deprecated|yanked], publishedAt,
                      createdAt, updatedAt)
connectors           (id, orgId, slug, name, provider, status,
                      createdAt, updatedAt)
connector_bindings   (id, orgId, connectorId, principalId, secretRef,
                      scopes[], status, createdAt, updatedAt)
swarms               (id, orgId, slug, name, topology jsonb, status,
                      createdAt, updatedAt)
swarm_versions       (id, swarmId, semver, manifest jsonb, memberRefs jsonb,
                      pricing jsonb, status, publishedAt, createdAt, updatedAt)

budgets              (id, orgId, scope jsonb, limitMinor, period
                      [once|daily|monthly], currency, hardStop bool,
                      createdAt, updatedAt)
budget_reservations  (id, orgId, budgetId, jobId, amountMinor, currency,
                      state[held|captured|released], createdAt, updatedAt)

jobs                 (id, orgId, principalId, capabilityKind, capabilityVersionId,
                      idempotencyKey, input jsonb, inputHash, state
                      [pending|authorized|queued|running|succeeded|failed|
                       canceled|expired], priority, attempt, maxAttempts,
                      reservationId, costMinor, currency, resultRef,
                      error jsonb, enqueuedAt, startedAt, finishedAt,
                      createdAt, updatedAt)
                     UNIQUE (orgId, idempotencyKey)
job_events           (id, jobId, seq, type, data jsonb, createdAt)  -- append-only

ledger_entries       (id, orgId, accountId, jobId|null, direction[debit|credit],
                      amountMinor, currency, kind, refId, createdAt)  -- append-only
receipts             (id, orgId, jobId, amountMinor, currency, x402TxRef,
                      providerRef, breakdown jsonb, issuedAt, createdAt)
idempotency_keys     (id, orgId, scope, key, requestHash, responseRef,
                      state[in_flight|completed], createdAt, updatedAt,
                      expiresAt)
                     UNIQUE (orgId, scope, key)

audit_log            (id, orgId, actorPrincipalId, action, resourceType,
                      resourceId, before jsonb, after jsonb, requestId,
                      ip, createdAt)  -- append-only
metering_events      (id, orgId, jobId, metric, quantity, unit, createdAt)
                      -- append-only
policies             (id, orgId, name, rules jsonb, enabled, createdAt, updatedAt)
```

> The `jsonb` manifest/schema columns are themselves validated by Zod at the
> application boundary; the DB stores the validated shape, never raw input.

---

## 4. API surface draft

All routes are versioned under `/api/v1`, accept and return JSON, and are
validated by Zod on the way in and on the way out. **Every mutating route runs
the `authz` guard server-side before any side effect.** Paid mutations require
an `Idempotency-Key` header.

| Method | Path                                  | Purpose                                  | Auth scope            |
| ------ | ------------------------------------- | ---------------------------------------- | --------------------- |
| POST   | `/api/v1/intents`                     | Submit an intent → resolves + creates job | `execution:write`    |
| GET    | `/api/v1/jobs/:id`                    | Job status + structured result            | `execution:read`     |
| POST   | `/api/v1/jobs/:id/cancel`             | Request cancellation                      | `execution:write`    |
| GET    | `/api/v1/jobs/:id/events`             | Stream/poll job events (audit-safe)       | `execution:read`     |
| GET    | `/api/v1/jobs/:id/receipt`            | Retrieve receipt                          | `billing:read`       |
| GET    | `/api/v1/catalog/skills`              | List resolvable skills                    | `catalog:read`       |
| POST   | `/api/v1/catalog/skills`              | Create skill                              | `catalog:write`      |
| POST   | `/api/v1/catalog/skills/:id/versions` | Publish a skill version                   | `catalog:write`      |
| GET    | `/api/v1/catalog/connectors`          | List connectors                           | `catalog:read`       |
| POST   | `/api/v1/connectors/:id/bindings`     | Bind connector credentials (secretRef)    | `connector:write`    |
| GET    | `/api/v1/catalog/swarms`              | List swarms                               | `catalog:read`       |
| POST   | `/api/v1/budgets`                     | Create/update budget                      | `billing:write`      |
| GET    | `/api/v1/budgets`                     | List budgets + spend                      | `billing:read`       |
| POST   | `/api/v1/payments/x402/settle`        | Settle an x402 challenge                  | `billing:write`      |
| POST   | `/internal/jobs/claim`                | Worker claims next job (mTLS/internal)    | worker identity      |
| POST   | `/internal/jobs/:id/result`           | Worker submits result + metering          | worker identity      |

Standard envelope:

```jsonc
// success
{ "data": { /* typed payload */ }, "requestId": "...", "receiptId": "..." }
// error
{ "error": { "code": "BUDGET_EXCEEDED", "message": "...", "retryable": false },
  "requestId": "..." }
```

Errors use the typed taxonomy in `lib/errors` (e.g. `UNAUTHORIZED`,
`POLICY_DENIED`, `BUDGET_EXCEEDED`, `PAYMENT_REQUIRED`, `CAPABILITY_NOT_FOUND`,
`IDEMPOTENCY_CONFLICT`, `SANDBOX_FAILURE`, `UPSTREAM_ERROR`). `PAYMENT_REQUIRED`
maps to HTTP **402** and carries the x402 challenge.

---

## 5. Execution lifecycle

```
submit intent
   │
   ▼
[validate]  Zod parse, attach requestId
   │
   ▼
[resolve]   capability resolver → pinned capabilityVersionId
   │
   ▼
[authorize] authz guard: principal scopes + policy rules
   │
   ▼
[price]     compute quoted cost from version pricing + estimated metering
   │
   ▼
[fund]      reserve from budget (HOLD) OR issue x402 402 challenge
   │
   ▼
[create]    INSERT job (UNIQUE orgId+idempotencyKey) in a single tx
   │           with budget_reservation(held) and audit_log entry
   ▼
[enqueue]   JobQueue.enqueue(jobId)   → state=queued
   │
   ▼
[run]       worker claims (lease), state=running, sandbox executes
   │
   ▼
[result]    worker posts output + metering_events
   │
   ▼
[settle]    capture reservation → ledger entries → receipt
   │           state=succeeded|failed; release/capture hold accordingly
   ▼
return structured result to Hermes
```

Guarantees:

- **Idempotency:** a repeated submit with the same `orgId + Idempotency-Key`
  returns the original job/result; it never double-charges or double-runs.
- **At-least-once execution, exactly-once billing:** workers may retry, but
  capture is keyed to `(jobId, attempt)` and reservations are captured once.
- **Crash safety:** job state transitions are persisted in Postgres before any
  external side effect; the queue is reconstructable from `jobs`.
- **Cancellation/timeout:** leases expire; expired/canceled jobs release holds.

---

## 6. x402 payment lifecycle

x402 is HTTP-native payment via the `402 Payment Required` status.

```
1. Caller submits intent without sufficient prepaid balance.
2. Platform prices the job, creates an idempotency record (in_flight),
   and responds 402 with an x402 challenge:
     { error.code=PAYMENT_REQUIRED, payment: { amountMinor, currency,
       accepts:[scheme], nonce, expiresAt, resource:"job:<draftId>" } }
3. Caller pays per the scheme and retries with:
     X-Payment: <settlement proof>   + same Idempotency-Key
4. payment.verify() validates proof with the PaymentProvider (external call,
   structured error handling, ret- and timeout-bounded).
5. On success: record ledger credit, mark idempotency completed, proceed to
   [create] in the execution lifecycle. Reservation captured on job settle.
6. A receipt is issued referencing x402TxRef + providerRef + cost breakdown.
```

Rules:

- The **same Idempotency-Key** spans the 402 challenge and the paid retry, so a
  network retry never charges twice.
- Verification and capture are **separate** ledger events; partial failures are
  reconciled from the append-only ledger.
- `PaymentProvider` is a port; local dev uses a deterministic mock adapter
  (clearly marked) that "settles" without real funds.

---

## 7. Skill lifecycle

A **skill** is a single, priced, versioned capability with declared input and
output schemas.

```
draft ──publish──▶ published ──deprecate──▶ deprecated ──yank──▶ yanked
  ▲                    │
  └──── new version ◀──┘  (semver; immutable once published)
```

- **Author/draft:** create `skill` + `skill_version(draft)` with manifest,
  `inputSchema`, `outputSchema`, and `pricing`.
- **Validate:** Zod-validate the manifest and schemas; reject ambiguous pricing.
- **Publish:** version becomes immutable and **resolvable**; pins are by semver.
- **Resolve:** the capability resolver maps an intent to one published version.
- **Deprecate:** still resolvable for pinned callers; hidden from discovery.
- **Yank:** unresolvable (e.g. security issue); existing receipts remain valid.

Every transition writes an `audit_log` entry; published versions are never
mutated, only superseded.

---

## 8. Connector lifecycle

A **connector** is a binding to an external system (e.g. an API/data source)
that skills/swarms may use. Credentials are stored as **secret references**,
never raw secrets.

```
register connector ──▶ bind credentials (secretRef) ──▶ authorize scopes
        │                        │                            │
        ▼                        ▼                            ▼
   define provider         store in secret mgr          enforce at use
        │                  (KMS / vault; DB holds ref)
        ▼
   health check ──▶ active ──(rotate)──▶ active ──(revoke)──▶ revoked
```

- **Register:** declare provider + capabilities the connector exposes.
- **Bind:** caller supplies credentials → stored in the secret manager; DB keeps
  only `secretRef` + metadata. No secret is ever logged or returned.
- **Use:** at execution time, the worker fetches the secret by ref inside the
  sandbox boundary, scoped to the job, with least privilege.
- **Rotate / revoke:** bindings can rotate secrets or be revoked without code
  changes; revoked bindings fail closed.
- **Audit:** every connector use is a `metering_event` + `audit_log` entry.

---

## 9. Swarm lifecycle

A **swarm** is a coordinated set of sandboxed agent workers executing a topology
(e.g. orchestrator + specialists) as one billable capability.

```
define topology ──▶ publish swarm_version ──▶ resolve ──▶ provision workers
                                                 │              │
                                                 ▼              ▼
                                          budget reserve   isolated sandboxes
                                                 │              │
                                                 ▼              ▼
                                          run (fan-out) ──▶ aggregate results
                                                 │
                                                 ▼
                                      meter per-member ──▶ settle ──▶ receipt
```

- **Define:** topology + member references (skills/connectors), per-member and
  aggregate pricing.
- **Provision:** each member runs in its **own** sandbox; no shared mutable
  state except through the platform-mediated message bus.
- **Coordinate:** the orchestrator is itself a sandboxed worker; it cannot
  exceed the swarm's budget reservation or policy scope.
- **Meter & settle:** metering is per member; the receipt rolls up member costs.
- **Failure:** partial failure is recorded per member; aggregate job state
  reflects the swarm's declared failure policy (all-or-nothing vs best-effort).

---

## 10. Local dev versus production runtime

| Concern        | Local dev adapter (clearly marked)        | Production runtime                         |
| -------------- | ----------------------------------------- | ------------------------------------------ |
| Postgres       | Dockerized Postgres                       | Managed Postgres (HA, PITR backups)        |
| `JobQueue`     | Postgres-backed `SKIP LOCKED` queue       | Managed queue (e.g. SQS/Redis) adapter     |
| `SandboxRuntime` | Local container/VM with strict limits   | Hardened microVM/container sandbox per job |
| `PaymentProvider` | Deterministic mock x402 settler        | Real x402 provider                          |
| Secrets        | `.env.local` (gitignored), never committed| KMS / secret manager + per-env injection   |
| Object storage | Local filesystem adapter                  | Managed object storage                      |
| Worker         | Separate `pnpm worker` process            | Autoscaled worker fleet, isolated network  |

Hard rules regardless of environment:

- The `SandboxRuntime` port is **always** used; "run code inline" is never a
  valid adapter, not even in dev.
- Local adapters are explicitly labeled `// LOCAL DEV ADAPTER` and live under
  `*/adapters/local/`.
- Config is loaded and Zod-validated at startup; missing required secrets fail
  fast. No secret has a default value in code.

---

## 11. Security risks (summary)

Full treatment in [`SECURITY_MODEL.md`](./SECURITY_MODEL.md). Headline risks:

- Untrusted code/data executing with platform privileges → strict sandbox port,
  never inline execution in request handlers.
- Authorization bypass on mutations → single server-side `authz` choke point.
- Double-charging / replay → idempotency keys + append-only ledger.
- Secret exposure → secret references only; secrets never logged or returned.
- Tenant isolation breaks → `orgId` scoping enforced in every query + policy.
- Budget circumvention → reservations (holds) before execution, fail-closed.

---

## 12. Commercial grade acceptance criteria

These are the gates for "production ready". Detailed checklist lives in
[`IMPLEMENTATION_SEQUENCE.md`](./IMPLEMENTATION_SEQUENCE.md).

- [ ] TypeScript `strict` (and `noUncheckedIndexedAccess`) — no `any` at
      boundaries; CI fails on type errors.
- [ ] Every API boundary validated by Zod (request + response).
- [ ] Every mutation passes a server-side authorization guard, with a test
      proving the unauthorized path is denied.
- [ ] Every paid action requires and enforces an idempotency key (proven by a
      double-submit test that does not double-charge).
- [ ] Every execution produces an append-only audit trail + metering events.
- [ ] No arbitrary code executes inside a Next.js request handler.
- [ ] No secrets in code or VCS; config validated at boot; secret scanning in CI.
- [ ] Postgres is the system of record; queue/cache are reconstructable.
- [ ] Every external call has timeouts, retries with backoff, and typed errors.
- [ ] Every important entity has `createdAt` + `updatedAt`.
- [ ] Money is integer minor units; ledger is double-entry and append-only.
- [ ] Migrations are versioned, forward-only, and reviewed.
