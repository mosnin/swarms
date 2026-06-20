# Deployment Topology

> Status: reference topology. Items marked **(not yet)** are required before the
> corresponding readiness level — see [`KNOWN_RISKS.md`](./KNOWN_RISKS.md) and
> [`COMMERCIAL_READINESS_REPORT.md`](./COMMERCIAL_READINESS_REPORT.md).

## Components

```
            ┌─────────────┐        ┌──────────────┐
   agents ─▶│  Web app    │  enqueue (DB row)     │
 (SDK/API)  │ (Next.js)   │───────────────────────┤
            │ control     │        ▼              ▼
            │ plane       │   ┌──────────┐   ┌──────────┐
            └─────────────┘   │ Postgres │◀──│ Worker   │
                  │           │ (system  │   │ fleet    │
                  │           │ of record)│  └──────────┘
                  ▼           └──────────┘        │
            ┌─────────────┐         ▲             ▼
            │ x402        │         │       ┌──────────────┐
            │ facilitator │         └───────│ Sandbox      │ (not yet)
            └─────────────┘                 │ runtime      │
                                            └──────────────┘
```

| Component | Role | Status |
|---|---|---|
| Web app (Next.js) | Dashboard, API control plane, auth, billing/payment gate, job creation/viewing, admin | Implemented |
| Postgres | System of record (jobs, ledger, audit, payments, …) | Implemented |
| Queue | Job delivery signal; durability via Postgres `status=queued` | In-memory dev adapter; durable broker **(not yet)** |
| Worker fleet | Executes jobs out-of-process (`apps/worker`) | Implemented (single-replica safe) |
| Object storage | Artifacts/outputs at scale | **(not yet)** — outputs currently stored as JSONB |
| Sandbox runtime | Isolated execution of untrusted skill code | Interface + dev stub only; real sandbox **(not yet)** |
| x402 facilitator | On-chain payment settlement/verification | Mock (testnet) adapter; real adapter env-gated **(not yet)** |
| Observability | Metrics/traces/log aggregation | Structured logs + request IDs; external sink **(not yet)** |

## Deploy paths

- **Web app**: any Node 20+ host (Vercel/container). Requires the env in
  [`.env.example`](../.env.example). Runs migrations on deploy
  (`npm run db:migrate`).
- **Worker**: separate container/process running `npm run worker`. Same
  `DATABASE_URL`; scaled independently of web. No inbound network needed.
- **Postgres**: managed Postgres with PITR backups **(backup strategy not yet
  automated in this repo)**.

## Environment

All configuration is validated at boot (`src/lib/env.ts`, fail-fast). Secrets
are never committed; see `.env.example`. Payment config (`X402_*`) is optional
in dev (mock provider) and **required + gated** for any real provider.

## Mainnet enablement checklist (gate)

Do **not** enable a real x402 provider until all are true:

1. `X402_PROVIDER=x402` with `X402_PAY_TO_ADDRESS` + `X402_FACILITATOR_URL` set.
2. The real facilitator adapter is wired (currently fails closed).
3. Payment replay/duplicate tests pass against the real adapter.
4. Payment monitoring + alerting exists.
5. Rate controls exist on `execute` / `execute-paid`.
6. Durable queue + worker autoscaling configured.

## Migration / rollback

- Migrations are forward-only, versioned in `drizzle/`, reviewed in PRs.
- Rollback strategy: deploy the previous web/worker image; **DB down-migrations
  are not authored** — destructive rollbacks require a restore from backup.
