# Operations Runbook

Operational procedures for running Swarms. Companion to
[`DEPLOYMENT_TOPOLOGY.md`](./DEPLOYMENT_TOPOLOGY.md) and
[`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md).

## Services

| Service | Start | Health |
|---|---|---|
| Web (control plane) | `npm run start` (after `npm run build`) | `GET /api/health`, `GET /api/ready` |
| Worker | `npm run worker` | logs "Swarms worker starting"; processes queued jobs |

Both require `DATABASE_URL`. The worker also honors `WORKER_POLL_INTERVAL_MS`,
`WORKER_BATCH_SIZE`, `WORKER_REAP_INTERVAL_MS`, `WORKER_MAX_RUN_MS`.

## Deploy

1. Run migrations: `npm run db:migrate` (forward-only; review the diff first).
2. Deploy the web image; verify `GET /api/ready` returns 200.
3. Deploy the worker image (separate); verify it logs job processing.
4. Roll back by redeploying the previous images (see INCIDENT_RESPONSE).

## Common tasks

### Stuck / running-too-long jobs
The worker reaps jobs running past `WORKER_MAX_RUN_MS`, failing them and
releasing budget holds. To check: query `jobs` where `status='running'` and
`started_at` is old. The reaper runs every `WORKER_REAP_INTERVAL_MS`.

### Reconcile the ledger
`GET /api/admin/reconcile` (owner) returns `{ ok, discrepancies }` comparing the
append-only ledger against payment receipts and succeeded jobs. A non-empty
`discrepancies` list means drift — investigate before payouts.

### Replay webhooks
Failed webhook deliveries are rows in `webhook_deliveries` with `status='failed'`.
To retry, set `status='pending'` and `next_attempt_at=now()`; the worker
redelivers on its next loop.

### Rate limiting
Set `RATE_LIMIT_BACKEND=postgres` for shared limits across web replicas
(`rate_limit_counters` table). `memory` is single-instance only.

### Diagnostics
`GET /api/admin/diagnostics` (owner) returns org job/skill/audit counts.

## Scaling

- Web: stateless; scale horizontally. Use `RATE_LIMIT_BACKEND=postgres`.
- Worker: scale horizontally; claiming uses `FOR UPDATE SKIP LOCKED` so replicas
  never double-process.
- Postgres is the bottleneck/system of record; size accordingly and enable PITR.

## Backups

See [`BACKUPS.md`](./BACKUPS.md). Postgres is the only stateful store; the
queue/cache are reconstructable from it.
