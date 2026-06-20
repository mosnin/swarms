# Hermes Cloud — Security Model

> Status: Draft v0.1. Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md).

Hermes Cloud executes work on behalf of autonomous agents and moves money. It
is, by design, a high-value target: it holds credentials, runs agent-directed
workloads, and authorizes spend. This document defines the trust boundaries,
controls, and the residual risks we accept.

## 1. Trust boundaries

```
 Untrusted                 │  Semi-trusted             │  Trusted
 ──────────────────────────┼───────────────────────────┼──────────────────────
 Caller intents & inputs   │  Worker fleet (sandboxed) │  Postgres (SoR)
 Capability author manifests│  Job queue                │  authz guard
 Connector responses        │  Object storage           │  Secret manager / KMS
 x402 settlement proofs      │                          │  Ledger / audit log
```

Core rule: **the Next.js control plane is trusted; everything an agent or author
supplies is untrusted; workers are sandboxed and semi-trusted.** Untrusted code
and data never execute with platform privileges.

## 2. Authentication

- **Machine callers (Hermes):** API keys. Stored only as a salted hash +
  short prefix for lookup. Keys carry scopes and an expiry; rotation and
  revocation are first-class.
- **Human operators (console):** session-based auth, separate from API keys.
- **Workers:** internal identity (mTLS / signed internal tokens) on the
  `/internal/*` surface; never reachable from the public internet.
- Failed auth is logged (without the credential) and rate-limited.

## 3. Authorization

- A **single server-side choke point** (`lib/authz`) authorizes every mutation.
  No mutation path may skip it; there is no client-trusted authorization.
- Model: principal → scopes (coarse) + policy rules (fine, e.g. which skills,
  which connectors, spend caps). Evaluation is **fail-closed**.
- Every tenant-owned query is scoped by `orgId`; cross-tenant access is
  impossible by construction, not by convention.
- Authorization decisions are auditable (`audit_log`).

## 4. Sandboxed execution

- All capability execution goes through the `SandboxRuntime` port. **Inline
  execution of caller/author code in a request handler is forbidden** — there is
  no adapter that does this, including in local dev.
- Each job (and each swarm member) runs in an **isolated** sandbox with:
  least-privilege network egress, CPU/memory/time limits, no ambient platform
  credentials, and per-job secret injection scoped to the job.
- Sandboxes are ephemeral and treated as compromised by default: results are
  validated against the declared `outputSchema` before being trusted.

## 5. Secrets management

- Secrets (connector credentials, provider keys) live in a secret manager /
  KMS. The database stores only a **secret reference**.
- Secrets are **never** logged, never returned in API responses, and never
  embedded in audit `before/after` snapshots.
- No secret has a default value in code. Config is Zod-validated at boot and the
  process **fails fast** if a required secret is missing.
- CI runs secret scanning; commits with secrets are blocked.

## 6. Money integrity

- Money is integer **minor units** + currency code. Floating point is banned for
  monetary math.
- The ledger is **double-entry and append-only**; receipts are immutable.
- Charging is idempotent: `(orgId, idempotencyKey)` guarantees exactly-once
  capture even under at-least-once execution and client retries.
- x402 verification and capture are distinct ledger events, independently
  reconcilable.

## 7. Auditability

- `audit_log`, `job_events`, `metering_events`, `ledger_entries`, and `receipts`
  are append-only. No code path updates or deletes them.
- Every mutation records actor, action, resource, request id, and before/after
  (secret-redacted). Every execution is fully reconstructable.

## 8. External calls

- Every external call (payment provider, connector, sandbox control) has
  timeouts, bounded retries with exponential backoff + jitter, and maps failures
  to the typed error taxonomy. Responses are Zod-validated before use.
- Idempotency keys are propagated to upstreams where supported.

## 9. Risk register

| # | Risk                                   | Likelihood | Impact | Mitigation                                                     |
| - | -------------------------------------- | ---------- | ------ | -------------------------------------------------------------- |
| 1 | Untrusted code escapes sandbox          | Low        | Crit.  | Hardened microVM, no ambient creds, egress allowlist, ephemeral |
| 2 | Authorization bypass on a mutation      | Med        | Crit.  | Single `authz` choke point; deny-path tests required           |
| 3 | Double-charge / replay                  | Med        | High   | Idempotency keys + append-only double-entry ledger              |
| 4 | Secret leakage (logs/responses/audit)   | Med        | Crit.  | Secret refs only; redaction in logger; secret scanning in CI    |
| 5 | Cross-tenant data access                | Low        | Crit.  | `orgId` scoping enforced in every query + policy                |
| 6 | Budget circumvention / runaway spend    | Med        | High   | Pre-execution holds; hard-stop budgets; fail-closed             |
| 7 | x402 settlement forgery                 | Low        | High   | Provider-side verification; proofs validated; nonce + expiry    |
| 8 | Prompt/intent injection via inputs      | High       | Med    | Treat inputs as untrusted; schema validation; sandbox isolation |
| 9 | Malicious/poisoned capability version   | Low        | High   | Author review, immutable versions, yank path, runtime isolation |
|10 | Queue/cache as source of truth drift    | Low        | Med    | Postgres is SoR; queue reconstructable; idempotent processing   |
|11 | DoS via expensive jobs                  | Med        | Med    | Per-principal rate limits, budget caps, sandbox resource limits |
|12 | Credential stuffing on API keys         | Med        | Med    | Hashed keys, rate limiting, anomaly logging, rotation/expiry    |

## 10. Security acceptance criteria

- [ ] No mutation reaches the database without passing `authz` (test-proven).
- [ ] No secret appears in logs, responses, or audit snapshots (redaction test).
- [ ] No capability code path executes inside a Next.js request handler.
- [ ] Required secrets missing ⇒ process fails to boot (test-proven).
- [ ] Double-submit of a paid action charges exactly once (test-proven).
- [ ] Cross-tenant read/write is impossible (test-proven).
- [ ] Secret scanning + dependency audit run in CI and block on findings.
