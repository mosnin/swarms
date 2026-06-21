# Incident Response

Lightweight incident process for Hermes Cloud. Scope: a paid agent-execution
platform handling org-scoped data, API keys, and (testnet) payments.

## Severity

| Sev | Definition | Examples |
|---|---|---|
| SEV1 | Data exposure, cross-org leak, payment loss/double-charge, total outage | Tenant isolation bug, ledger corruption |
| SEV2 | Major degradation, no data loss | Worker fleet down (jobs queue but don't run), payment provider down |
| SEV3 | Minor / contained | Elevated webhook failures, single endpoint errors |

## First responder checklist

1. **Declare + assign** an incident owner; pick a severity.
2. **Stop the bleeding** (see playbooks). Prefer reversible mitigations.
3. **Preserve evidence**: capture audit events (`audit_events` is append-only),
   ledger entries, and logs (request IDs correlate them).
4. **Communicate** status to stakeholders.
5. After resolution, write a blameless postmortem.

## Playbooks

### Suspected cross-org data access (SEV1)
- Revoke suspected API keys (`DELETE /api/api-keys/{id}` or set `revoked_at`).
- Audit the actor: query `audit_events` by `actor_api_key_id` / `actor_user_id`.
- Tenant guards fail closed (`requireOrganization`); look for a missing guard on
  a new route and patch + test (`tests/security/org-isolation.test.ts`).

### Payment dispute / suspected double-charge (SEV1)
- Run `GET /api/admin/reconcile` for the org.
- Payments are bound to `(org, skillVersion, idempotencyKey, amount)` and a
  settlement ref funds one binding; check `x402_payment_receipts` (unique
  `(org, tx_ref)`) and the `payment` ledger entries.
- Corrections are **append-only** compensating ledger entries — never edit rows.

### Worker fleet not processing (SEV2)
- Confirm jobs are `queued` in `jobs`. Restart/scale the worker.
- Jobs stuck `running` past `WORKER_MAX_RUN_MS` are reaped automatically (holds
  released). If the reaper is not running, restart the worker.

### Budget/ledger looks wrong (SEV2)
- The ledger is append-only and reconcilable; run reconciliation.
- Reservations (holds) net against releases; a stuck hold is released by the
  reaper or on cancel.

### Mainnet/payment provider issue
- The real x402 provider is **gated off** by default and fails closed; if a real
  provider is enabled and misbehaving, set `X402_PROVIDER` back to a safe state
  and stop accepting paid execution.

## Rollback

DB migrations are forward-only (no down-migrations). To roll back:
1. Redeploy the previous web + worker images.
2. If a migration must be undone, restore from a PITR backup (see BACKUPS.md) —
   coordinate carefully; this is destructive.

## Known limitations affecting incidents

See [`KNOWN_RISKS.md`](./KNOWN_RISKS.md): no real sandbox (don't run untrusted
code), mainnet gated, external monitoring not yet wired (rely on structured logs
+ request IDs + audit trail).
