-- 0013_fixes.sql
-- Correctness, security, and idempotency fixes surfaced by the 10-agent audit.

-- 1. Swarm idempotency: add idempotency_key to swarm_runs so replaying the same
--    key returns the cached run instead of spawning a new workforce and charging again.
ALTER TABLE "swarm_runs" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(255);
CREATE UNIQUE INDEX IF NOT EXISTS "swarm_runs_org_idempotency_uq"
  ON "swarm_runs"("organization_id","idempotency_key");

-- 2. Exactly-once billing guard: at most one 'charge' entry per job. A duplicate
--    key violation on retry is turned into a no-op by ON CONFLICT DO NOTHING in the
--    application layer, so a crashed-then-restarted job cannot be charged twice.
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_job_charge_uq"
  ON "usage_ledger_entries"("job_id")
  WHERE kind = 'charge' AND job_id IS NOT NULL;
