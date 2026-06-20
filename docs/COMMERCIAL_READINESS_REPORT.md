# Commercial Readiness Report

Companion to [`AUDIT_REPORT.md`](./AUDIT_REPORT.md). Summarizes where Hermes Cloud
stands commercially and what each launch level still needs.

## Scorecard

| Area | Rating | Notes |
|---|---|---|
| Architecture quality | Strong | Clean control-plane/worker split; port-based, testable cores. |
| Security posture | Strong (beta) | Fail-closed authz, tenant isolation, hashed keys, redaction. Rate limiting missing. |
| Payment correctness | Strong (testnet) | Binding/replay/duplicate protection tested. Mainnet not wired. |
| Budget correctness | Strong | Reserve/commit/release on append-only ledger; hard-stop enforced. |
| Worker separation | Good | Out-of-process worker. Single-replica claiming only. |
| Test coverage | Good | 216 unit/security/spec tests; DB integration tests are the main gap. |
| Dashboard usability | Good | All sections present with empty states; honest about mocks. |
| API clarity | Strong | Documented + OpenAPI; SDK matches routes. |
| SDK usability | Strong | Typed, validated, builds standalone, no key leakage. |
| Deployment readiness | Partial | Topology/env documented; backups/queue/monitoring open. |

## What is beta-ready (testnet, invited users)

1. Developer creates an API key (hashed, scoped, revocable).
2. Create/publish an immutable skill version.
3. Agent calls `executeSkill` (SDK) → idempotent job created.
4. Standalone worker processes the job.
5. Logs, worker runs, and usage ledger are recorded and visible.
6. Paid execution gated by x402 (testnet/mock) with replay protection.
7. Policy denial / budget hard-stop block execution before any run.
8. Approval flow holds high-risk jobs until approved.
9. Connector calls are scope-enforced; external writes require approval.
10. A demo swarm runs child jobs within an aggregate budget and merges results.
11. Security docs are honest about sandbox/mainnet limitations.

## What is NOT production-safe yet

1. No rate limiting on paid/job-creation endpoints.
2. In-memory queue adapter (durable broker not wired; DB is the durable record).
3. Single-worker claiming; no stuck-job reaper.
4. Real mainnet x402 not wired or monitored (gated off).
5. No automated DB backups / rollback runbook.
6. No external observability sink.

## What is NOT marketplace-safe yet

1. No production sandbox — untrusted third-party code cannot run safely.
2. No creator review workflow or dispute/abuse handling.
3. Connector secret broker is design-level only.

## Recommendation

**Launch an invited, testnet paid beta** with trusted users now. Do **not**
enable mainnet payments, public skill execution of untrusted code, or open
marketplace signups until the production and marketplace gates in
[`AUDIT_REPORT.md`](./AUDIT_REPORT.md) are met.
