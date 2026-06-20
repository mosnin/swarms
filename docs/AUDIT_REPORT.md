# Hermes Cloud — Comprehensive Readiness Audit Report

Audit pack: `hermes_cloud_comprehensive_readiness_audit.md` v1.0
Date: 2026-06-20 · Branch: `claude/sharp-faraday-aiypkr` · Commit: see PR #1

This report is evidence-based. Items are marked **pass** only where the repo
proves it (file/function, test name, or command output). Where the
implementation is a development stand-in, it is labeled as such and not counted
as production-ready.

---

## 1. Executive verdict

Hermes Cloud is a **coherent, well-architected paid agent-execution platform**
that has reached **paid private beta** quality on testnet. The full core loop —
authn/authz → policy → budget → (x402) payment → idempotent job → out-of-process
worker → usage ledger → audit — is implemented, wired into the real execution
path, and covered by **216 passing unit/security tests**. Money is integer
minor units; the ledger and audit trail are append-only; published skill versions
are immutable; payments are bound to the exact request and cannot be replayed or
reused.

It is **not** production- or marketplace-ready, and the repo is honest about
that: there is **no real sandbox** for untrusted code (dev stub fails closed),
the x402 provider is a **testnet mock** (real adapter gated off), there is **no
rate limiting**, and operational concerns (durable queue, automated backups,
multi-worker claiming, monitoring) are documented as open.

## 2. Beta readiness verdict — **YES (testnet, trusted/invited users)**

All beta-gate items are met (Phase 20 below). Caveats, all acceptable for an
invited beta with documentation: no rate limiting (mitigated by budgets +
policy + trusted users), and live `db:migrate`/`db:seed` could not be executed in
this audit environment (no Postgres) — they are verified to *generate* cleanly.

## 3. Production readiness verdict — **NO**

Blockers: no rate controls on paid/job endpoints, in-memory queue adapter (DB is
durable but no broker), single-worker claiming, no stuck-job reaper, no automated
backups/rollback, real x402 not wired/monitored.

## 4. Public marketplace readiness verdict — **NO**

Hard blocker: no production-safe sandbox; untrusted third-party code cannot run
safely. Creator review workflow and dispute/abuse handling are not built. Skill
immutability, creator revenue ledger, and platform-fee accounting *are* in place.

---

## 5. Critical blockers (block their respective launch level)

- **C-1 (marketplace)** No real sandbox for untrusted code. Evidence:
  `src/server/sandbox/*`, `docs/SANDBOX_RUNTIME.md`. Selector fails closed in
  prod; stub refuses to execute. Honest, but blocks public marketplace.
- **C-2 (mainnet)** Real x402 settlement not wired. Evidence:
  `src/server/payments/config.ts` throws for `X402_PROVIDER=x402`. Testnet/mock
  only. Blocks real-money production.

No critical blocker exists for **beta** (testnet, trusted users).

## 6. High severity issues

- **H-1** No rate limiting on `execute` / `execute-paid` / `swarms/run`.
  Impact: cost/DoS abuse by a compromised key. Mitigated for beta by budgets +
  policy. Fix: per-key/IP token bucket. (`KNOWN_RISKS` KR-3)
- **H-2** Single-worker job claiming. Multiple replicas can double-process.
  Evidence: `pollQueuedJobs` (no `SKIP LOCKED`). (KR-4)
- **H-3** No stuck-job/lease reaper; a worker crash can leave a job `running`
  with an outstanding hold. (`worker_runs.leaseExpiresAt` exists, unused.) (KR-5)

## 7. Medium severity issues

- **M-1** Budget scopes beyond org/period are modeled but not all enforced
  (`api_key_daily`, etc.). Evidence: `checkBudget.ts` enforces org budgets. (KR-6)
- **M-2** No automated DB backups / down-migrations. (`DEPLOYMENT_TOPOLOGY.md`,
  KR-7)
- **M-3** Connector secret broker is design-level (no real connectors/sandbox
  yet). (KR-8)
- **M-4** No external observability sink (logs/metrics shipping). (KR-10)

## 8. Low severity issues

- **L-1** `streamJobLogs` is a polling placeholder (SDK). (KR-9)
- **L-2** Artifact scanning is a placeholder in the sandbox interface. (KR-11)
- **L-3** Webhooks accepted (`callbackUrl`) but delivery not implemented;
  documented as placeholder (`docs/WEBHOOKS.md`).

## 9. Missing tests

Covered well: money, idempotency, manifest, visibility, job core + state
machine, processJob loop, payments (binding/replay/duplicate), policy, budget
math, connectors, swarm planner/merge/executor, SDK client, redaction, revenue
split, plus a dedicated `tests/security/*` suite and an OpenAPI conformance test.

Gaps (integration-level, need a live Postgres — not runnable in this audit env):
- End-to-end DB integration tests for `executeSkill` / `executePaidSkill` /
  `runSwarm` (currently the *cores* are unit-tested via in-memory ports; the DB
  repositories are exercised only indirectly).
- API route handler tests (auth → 401/403, validation → 400) against a test DB.
- Migration-forward + seed idempotency test against a live database.

## 10. Broken or misleading docs

None found that overclaim. Docs are explicit about dev stubs and gates:
`SANDBOX_RUNTIME.md` ("no production-safe sandbox"), `X402_PAYMENT_INTEGRATION.md`
("testnet/mock"), `KNOWN_RISKS.md`, `WEBHOOKS.md` ("not yet delivered"). The
implementation matches the documentation.

## 11. Security concerns

Strong posture. Guards fail closed (`access-control.ts` + `tests/security/authz`),
tenant isolation enforced (org id verified, never trusted from body), API keys
hashed + revocable + scoped, scope escalation prevented (`assertScopesGrantable`),
secrets redacted (`redaction.ts` + tests), ledger/audit append-only. Open: rate
limiting (H-1), real sandbox (C-1). See `docs/THREAT_MODEL.md`.

## 12. Payment concerns

Binding to `(org, skillVersion, idempotencyKey, amount, currency)`; unique
`(org, txRef)`; idempotent settle; failed verification creates no job; metadata
carries no sensitive user data. Tested in `tests/security/payments.test.ts` +
`payment-service.test.ts`. Concern: real mainnet adapter not wired (C-2).

## 13. Data model concerns

All 24 expected entities present with stable prefixed public IDs, org scoping,
`createdAt`/`updatedAt`, append-only ledger/audit, integer-minor-unit money,
immutable published skill versions, payment receipts bound to job/org/binding,
connector secrets stored by reference/encrypted only. No concerns. Indexes exist
for org/job/skill/status/timestamp access patterns.

## 14. Worker and sandbox concerns

Worker runs out-of-process (`apps/worker`), no dashboard dependency, graceful
shutdown, commits/releases budget. Concerns: single-replica claiming (H-2),
no reaper (H-3). Sandbox is interface + honest dev stub only (C-1) — correctly
fails closed and never runs untrusted code.

## 15. Dashboard concerns

All expected pages present (overview metrics, skills, jobs + detail with logs /
worker runs / ledger / receipt, swarms + detail, connectors, marketplace,
creator revenue, budgets, policies, approvals, audit, payments, usage, API keys,
members) with empty states; all reads permission- + org-guarded; API key shown
once; receipts redacted on render. No cross-org leakage path found.

## 16. SDK concerns

`@hermes-cloud/sdk` builds independently (emits JS + d.ts), typed client, Zod
response validation, typed errors, never logs the API key (transport-safety
test), idempotency + budget helpers, x402 signer adapter, examples compile.
Matches real routes (verified against `openapi.json` + route files).

## 17. Recommended fix order

1. **Rate limiting** on `execute`/`execute-paid`/`swarms/run` (H-1).
2. **Multi-worker SKIP LOCKED claiming** + **stuck-job reaper** (H-2, H-3).
3. **Real x402 adapter** + payment monitoring; keep mainnet gated until tested (C-2).
4. **Durable queue** adapter + **automated backups/rollback** (M-2).
5. **DB integration + route tests** against a test Postgres (close §9 gaps).
6. **Real sandbox** (microVM/gVisor) + connector broker before any marketplace (C-1, M-3).
7. Creator review + dispute/abuse handling for marketplace.

## 18. Exact files inspected (representative)

- Config/primitives: `src/lib/{env,result,errors,logger,authz,idempotency,money,time,ids,redaction,request-id}.ts`, `src/lib/api.ts`
- DB: `src/lib/db/index.ts`, `src/lib/db/schema/*.ts`, `src/lib/db/seed.ts`, `drizzle/0000..0005_*.sql`
- Identity: `src/modules/identity/*` (access-control, service, roles, api-keys, session, current)
- Catalog: `src/modules/catalog/{manifest,visibility,skill-service,skill-version-service}.ts`
- Execution: `src/modules/execution/{job-service,job-repository,worker,input-validation}.ts`, `src/server/jobs/*`, `src/server/runners/*`, `src/server/queue/*`
- Payments: `src/modules/billing/{payment-service,payment-repository,ledger-service,ledger-repository}.ts`, `src/server/payments/*`
- Governance: `src/server/policy/*`, `src/server/budget/*`, `src/modules/governance/*`
- Connectors: `src/server/connectors/*`, `src/modules/connectors/connector-service.ts`
- Swarms: `src/server/swarms/*`, `src/modules/swarms/swarm-repository.ts`
- Sandbox: `src/server/sandbox/*`
- Marketplace: `src/modules/marketplace/*`
- Worker app: `apps/worker/index.ts`
- SDK: `packages/hermes-cloud-sdk/**`
- Routes: `src/app/api/**`; Dashboard: `src/app/(dashboard)/**`
- Tests: `src/**/*.test.ts`, `tests/security/*`, `tests/docs/openapi.test.ts`
- Docs: `docs/*.md`, `SECURITY.md`, `openapi.json`

## 19. Exact commands run

```
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
npm run test           # vitest run
npm run build          # next build
npx drizzle-kit generate
```

(`db:migrate` / `db:seed` require a live Postgres, which is not available in this
audit environment; the schema generates cleanly with no drift.)

## 20. Command results summarized

- `typecheck`: **pass** (no errors, strict mode).
- `lint`: **pass** (no ESLint warnings/errors).
- `test`: **pass** — **216 tests across 31 files**.
- `build`: **pass** — all routes/pages compile.
- `drizzle-kit generate`: **clean** — "No schema changes, nothing to migrate";
  6 forward-only migrations present.
- `db:migrate` / `db:seed`: **not run** here (no Postgres).

## 21. Per-phase results

```
Phase 0 — Repository discovery:        pass   (info)
Phase 1 — Product & architecture:      pass   (low)
Phase 2 — Build quality:               partial(low)  build/lint/test/typecheck pass; live migrate/seed not run (no DB)
Phase 3 — Data model:                  pass   (low)
Phase 4 — AuthN & AuthZ:               pass   (low)
Phase 5 — API routes / server actions: pass   (medium) no server actions; rate limiting missing
Phase 6 — Skill registry:              pass   (low)
Phase 7 — Job execution:               pass   (low)
Phase 8 — Worker runtime:              pass   (high)   single-worker; multi-replica claiming open
Phase 9 — x402 payment:                pass   (high)   testnet/mock; mainnet gated
Phase 10 — Budget & policy:            pass   (low)
Phase 11 — Connector / MCP:            pass   (low)    mocks only (by design)
Phase 12 — Swarm orchestration:        pass   (low)
Phase 13 — SDK:                        pass   (low)
Phase 14 — Dashboard:                  pass   (low)
Phase 15 — Audit & observability:      partial(medium) audit+redaction+request-id present; external sink missing
Phase 16 — Security:                   partial(high)   strong; rate limiting missing
Phase 17 — Sandbox runtime:            pass   (critical-for-marketplace) honest stub, fails closed
Phase 18 — Marketplace economics:      pass   (medium) ledger+fee+immutability; review workflow missing
Phase 19 — Deployment readiness:       partial(high)   topology/env docs; backups/rate/incident open
Phase 20 — Beta launch gate:           pass   (high)
Phase 21 — Production launch gate:     fail   (critical) rate/queue/backups/mainnet open
Phase 22 — Public marketplace gate:    fail   (critical) no real sandbox
```

---

## Final verdict

```
Final verdict:
Beta ready: yes
Production ready: no
Can safely process paid testnet execution: yes
Can safely process real mainnet payments: no
Can safely execute untrusted third party code: no
Can safely expose public skill marketplace: no

Top 10 fixes before beta:
1. (none are blocking) Add basic rate limiting on execute/execute-paid as defense in depth.
2. Document the invited-beta scope + trusted-user assumption in onboarding.
3. Verify db:migrate + db:seed against a live Postgres in CI.
4. Add API route handler tests (401/403/400) against a test DB.
5. Add an end-to-end free + paid execution integration test (live DB).
6. Confirm X402 stays on testnet/mock for beta (config gate already enforces).
7. Add a swarm end-to-end integration test (child jobs + budget cap).
8. Add a CI workflow running typecheck+lint+test+build on push.
9. Smoke-test the standalone worker against the seeded DB.
10. Review KNOWN_RISKS with beta users so expectations are explicit.

Top 10 fixes before production:
1. Rate limiting / abuse controls on paid + job-creation endpoints.
2. Multi-worker SKIP LOCKED claiming.
3. Stuck-job / lease reaper releasing holds on worker death.
4. Wire + monitor the real x402 facilitator adapter; keep mainnet gated until tested.
5. Durable queue adapter (broker) behind the existing JobQueue port.
6. Automated DB backups (PITR) + documented restore/rollback runbook.
7. Payment monitoring + alerting; reconciliation jobs for ledger vs receipts.
8. External observability sink (logs/metrics/traces) + request-id propagation end to end.
9. Enforce per-key/connector budget scopes (not just org/period).
10. Incident response process + on-call runbook.
```
