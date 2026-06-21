# Security

Hermes Cloud is infrastructure for autonomous, paid agent execution. It handles
organization-scoped data, API keys, paid x402 usage, connector permissions, and
(in future) untrusted code. We treat it as security-sensitive.

## Reporting a vulnerability

Email the maintainers (see repository owner). Do not open public issues for
security reports. Please include reproduction steps and impact.

## Security model (summary)

See [`docs/SECURITY_MODEL.md`](./docs/SECURITY_MODEL.md) and
[`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md) for detail.

- **AuthN**: human sessions and agent API keys. Keys are stored as a prefix + a
  one-way hash (optional HMAC pepper) — never plaintext; shown once on creation;
  revocable; carry scoped permissions; stamp `lastUsedAt`.
  (`src/modules/identity/*`)
- **AuthZ**: every mutation and org-scoped read passes `requirePermission` +
  `requireOrganization` — the single choke point, fail-closed.
  (`src/modules/identity/access-control.ts`)
- **Tenant isolation**: org id is enforced server-side; cross-tenant access
  throws. Org id from a request body is verified against the authenticated
  principal, never trusted directly.
- **Payments**: each payment is bound to `(org, skill version, idempotency key,
  amount, currency)`; replay returns the same receipt (no double charge); a
  settlement reference can fund at most one binding (unique `(org, txRef)`).
  (`src/modules/billing/payment-service.ts`)
- **Money**: integer minor units only; the usage ledger is append-only
  (corrections are compensating entries).
- **Budgets/Policy**: hard-stop budgets and policy rules are enforced in the
  execution path before enqueue, not just displayed.
- **Audit**: significant actions append immutable audit events; secrets are
  redacted from logs/audit/diagnostics (`src/lib/redaction.ts`).
- **Execution isolation**: no untrusted code runs in a request handler; jobs run
  in a separate worker; the only sandbox is a dev stub that refuses to execute
  (`docs/SANDBOX_RUNTIME.md`).

## Hardening status

| Control | Status |
|---|---|
| Server-side authz on mutations | ✅ |
| Tenant isolation | ✅ |
| API key hashing + revocation | ✅ |
| Payment binding / replay / duplicate protection | ✅ (mock provider; real adapter gated) |
| Append-only ledger + audit | ✅ |
| Budget + policy enforcement | ✅ |
| Secret redaction | ✅ |
| Worker separation | ✅ (multi-worker SKIP LOCKED claiming + reaper) |
| Rate limiting on paid/job endpoints | ✅ token bucket + distributed Postgres backend |
| Per-key / per-skill budget scopes | ✅ enforced |
| Signed webhook delivery (HMAC) | ✅ durable outbox, retried |
| Ledger reconciliation | ✅ owner endpoint + tests |
| Real sandbox for untrusted code | ❌ not yet — public marketplace blocked |
| Mainnet payments | ❌ gated off |

See [`docs/KNOWN_RISKS.md`](./docs/KNOWN_RISKS.md) for every unresolved risk.
