# Worker Runtime

> Status: implemented (single-worker). Multi-replica claiming is a documented
> production hardening (see [`KNOWN_RISKS.md`](./KNOWN_RISKS.md)).

## Why a separate worker

Per the architecture constraint, **Next.js is the control plane, not the
execution layer**. The web app authenticates, authorizes, prices, gates
(policy + budget + payment), creates the durable job row, and enqueues. It never
runs capability logic in a request handler.

Execution happens in a **standalone worker process** (`apps/worker/index.ts`),
deployed and scaled independently. It depends only on Postgres and the shared
execution core — it imports no web, dashboard, or browser code.

## Components

| Concern | Location |
|---|---|
| Worker entrypoint (loop + graceful shutdown) | `apps/worker/index.ts` |
| Durable poll / claim | `pollQueuedJobs()` in `src/modules/execution/worker.ts` |
| Per-job processing core (storage-agnostic, tested) | `src/server/jobs/processJob.ts` |
| State machine | `src/server/jobs/stateMachine.ts` |
| Runners (mock / http / local-stub) | `src/server/runners/*` |
| Usage charge + budget commit/release | `src/server/budget/*`, `src/modules/billing/ledger-*` |

## Lifecycle

1. Web app: `POST /api/v1/execute` → validate → policy → budget → create job
   (`status = queued`) → enqueue. **No execution in the request.**
2. Worker: `pollQueuedJobs` selects queued jobs (oldest first).
3. `processJob`: `queued → running`, insert `worker_run`, invoke the runner for
   the pinned `skill_version.runnerType`, write execution logs, record duration +
   cost, then `running → succeeded|failed`.
4. On success: append usage charge (debit) and release the reservation hold
   (`commitBudget`). On failure: release the hold (`releaseBudget`).
5. Redelivery of a non-queued job is a no-op (idempotent) — no double execution.

## Running

```bash
# Web (control plane)
npm run dev

# Worker (separate process; needs DATABASE_URL)
npm run worker
```

Environment knobs: `WORKER_POLL_INTERVAL_MS` (default 1000),
`WORKER_BATCH_SIZE` (default 5).

For local single-process demos only, the dev endpoint
`POST /api/internal/jobs/process` drains the in-memory queue; it is disabled in
production.

## Graceful shutdown

`SIGINT`/`SIGTERM` stop the loop after the current batch settles, then the
process exits cleanly so an in-flight job is never abandoned mid-write.

## Production hardening (not yet)

- **Multi-worker claiming**: switch `pollQueuedJobs` to
  `SELECT ... FOR UPDATE SKIP LOCKED` (or an atomic `queued → running` claim) so
  multiple replicas never grab the same job.
- **Durable broker**: the `JobQueue` port allows swapping the in-memory dev queue
  for SQS/Redis; the Postgres poll already provides durability.
- **Leases + reaping**: `worker_runs.leaseExpiresAt` exists for lease-based
  recovery of jobs whose worker died mid-run (reaper not yet built).
