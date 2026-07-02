# Backup & Restore Strategy

Postgres is the **only stateful system of record**. The queue, cache, and any
object storage are derived and reconstructable from it, so backup policy centers
entirely on Postgres.

## Policy (target)

- **Managed Postgres with PITR** (point-in-time recovery) enabled.
- **Continuous WAL archiving** + automated daily base backups.
- **Retention**: ≥ 30 days PITR window (tune to compliance needs).
- **Encryption** at rest and in transit.
- **Restore drills**: exercise a restore to a scratch instance at least quarterly
  and record the RTO/RPO achieved.

> Status: this repository does not provision infrastructure. The above is the
> required policy; configure it in your managed Postgres provider. Tracked as
> KR-7 in [`KNOWN_RISKS.md`](./KNOWN_RISKS.md).

## What must be recoverable

All app state lives in Postgres tables — identity, catalog, execution, billing
(append-only ledger + receipts), governance (append-only audit), swarm, webhook
outbox, rate-limit counters. Append-only tables (ledger, audit) are the
financial/forensic record and must never be lost.

## Restore procedure (outline)

1. Provision a new Postgres from the latest base backup + WAL to the target
   timestamp (PITR).
2. Point the web + worker at the restored `DATABASE_URL`.
3. Run `npm run db:migrate` if the restored snapshot predates the deployed
   schema (forward-only).
4. Run `GET /api/admin/reconcile` per active org to confirm ledger integrity.
5. Resume traffic; the queue rebuilds from `jobs` (status `queued`) — no
   separate queue restore is needed.

## Migrations

Forward-only, versioned in `drizzle/`, reviewed in PRs. There are **no
down-migrations**; a schema rollback requires a PITR restore (destructive) and
must be coordinated as an incident (see [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md)).
