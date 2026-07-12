# Product roadmap — compounding PMF

Swarms is an execution layer for autonomous agents. Each phase below is
sequenced so value **compounds**: early phases drive activation + retention
(make runs usable and habitual), the middle builds the trust + money loop that
converts usage into revenue, and the later phases build the composability +
enterprise moat that defends it. Every phase reuses the existing hardened spine
(append-only ledger, atomic budget ceilings, MCP self-describing catalog,
governance gate, webhooks) — no new trust boundaries.

## Horizon 1 — activation & retention (make it usable and habitual)

1. **✅ Scheduled & recurring runs.** Cron for agents: enqueue a job / swarm /
   simulation on a schedule. Turns one-off calls into a standing habit — the
   single biggest retention lever. Shipped: `schedules` table + UTC cron
   evaluator, `runDueSchedules` on the worker tick (exactly-once per firing via
   per-firing idempotency + CAS), CRUD/pause/resume routes, MCP catalog.
2. **✅ Result artifacts + object storage.** Runs emit files (reports, CSVs,
   transcripts, images) to an object store behind a port, with signed downloads
   and retention. Shipped: `ObjectStore` port with a DB LOCAL-DEV adapter + an
   S3/R2 adapter (SigV4 presigned URLs), `artifacts` table (content-hashed,
   org-scoped), upload/list/download routes, retention reaper, MCP catalog.
3. **✅ Prepaid credits + auto-reload + spend analytics.** Close the money loop:
   top up, auto-reload at a threshold, and a burn-rate/spend view built from
   ledger data already recorded. Shipped: `credit` grants, ledger-derived
   balance + usage analytics (burn rate, runway), a `TopUpProvider` port
   (mock/none adapters) with row-locked auto-reload (threshold + min-interval,
   no double-charge across replicas), routes for balance/usage/credits/
   auto-reload, MCP catalog. The biggest revenue unlock.

## Horizon 2 — trust & expansion (convert usage to durable revenue)

4. **Human-in-the-loop approvals.** A pending-approvals inbox (dashboard +
   webhook + MCP approve/reject) on top of the existing `require_approval`
   policy effect — makes governance actually usable and unblocks approval for
   swarms/simulations.
5. **Evaluators / quality scoring.** Optional post-run judge (LLM-as-judge or
   rubric) that scores outputs and can gate aggregation on a threshold. Turns
   "it ran" into "it ran well" — a premium metered add-on.
6. **Cost anomaly alerts.** Detect runs that cost N× their estimate and alert
   via the existing webhook fan-out. Trust + cost-control for finance buyers.

## Horizon 3 — composability & moat (defend and expand)

7. **DAG workflows.** Dependencies between tasks (fan-in / fan-out, B-after-A
   with A's output threaded in) — real pipelines without a heavyweight engine.
8. **Replay with overrides / experiments.** Re-run any past run with a tweaked
   model / prompt / budget for A/B comparison — an optimization flywheel.
9. **API-key scoping & rotation, connector marketplace.** Per-key budget caps,
   one-click rotation, and more first-class inheritable MCP connectors —
   multi-tenant scale + ecosystem.

Each phase lands behind the same bar as the rest of the repo: strict TS, Zod at
every boundary, server-side authz on every mutation, append-only money, and
unit + integration tests.
