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

4. **✅ Human-in-the-loop approvals.** A pending-approvals inbox on top of the
   existing `require_approval` policy effect. Shipped: swarms + simulations now
   honor `require_approval` (held in `awaiting_approval`, director not enqueued,
   run not started) instead of refusing; approval-service list/approve/reject
   (approve enqueues + flips the run to queued, reject cancels both), human-only
   guard (an agent principal cannot approve its own gated spend), approval
   webhooks, routes, MCP catalog.
5. **Evaluators / quality scoring.** Optional post-run judge (LLM-as-judge or
   rubric) that scores outputs and can gate aggregation on a threshold. Turns
   "it ran" into "it ran well" — a premium metered add-on.
6. **✅ Cost anomaly alerts.** Shipped: after a charge commits, compare it to
   the org's trailing average (last N charges); a spend ≥ factor× the average
   and above a floor raises a `cost.anomaly` audit event + webhook. Pure
   detector, worker-hooked, env-tunable (COST_ANOMALY_FACTOR/MIN/WINDOW).

5. **✅ Evaluators / quality scoring.** Shipped: an LLM-as-judge that scores
   inline content or a prior job/swarm/simulation output against a weighted
   rubric, returning per-criterion scores + a weighted overall + pass/fail vs a
   threshold. Runs as a charged `evaluation` job through the agent runtime
   (mock + llm runtimes), reserve-before-claimable, approval-aware. Routes +
   MCP catalog (evaluate, get-evaluation).

## Horizon 3 — composability & moat (defend and expand)

7. **✅ DAG workflows.** Shipped: `steps` on POST /api/v1/swarms — named steps
   with `dependsOn` edges, validated as a proper DAG (pure Kahn-based module)
   and executed by the director in topological waves: independent steps run
   concurrently, dependants receive their dependencies' outputs keyed by step
   name, and a failed step cascade-skips its dependants at zero cost. Reuses
   the whole swarm spine (budget split, worker rows, cancel, stream, webhooks).
8. **✅ Replay with overrides / experiments.** Shipped: POST /:id/replay on
   jobs, swarms, and simulations. Re-runs a past run as a NEW run with tweaked
   task/objective/model/budget/maxRounds; inherited resources re-attached
   server-side, full policy + budget gates re-applied, fresh idempotency key
   (with `replayTag` to run several variants), response carries `replayedFrom`.
9. **✅ API-key scoping & rotation.** Per-key hard-stop budget caps shipped
   earlier (`budgetMinor` at key creation → scoped budget). Now added:
   POST /api/v1/keys/:keyId/rotate — rotates the secret IN PLACE (same key id,
   so the scoped budget, audit attribution, and schedules keep working; the old
   secret dies immediately; new plaintext returned exactly once). Remaining
   (ecosystem, not architecture): a broader first-party connector marketplace.

Each phase lands behind the same bar as the rest of the repo: strict TS, Zod at
every boundary, server-side authz on every mutation, append-only money, and
unit + integration tests.

## Hardening tranche (post-roadmap gap closure)

- **✅ Orphan reapers** for simulation runs and evaluations (a dead director now
  settles its run to failed instead of leaving it stuck non-terminal), wired
  into the worker tick beside the swarm-run reaper.
- **✅ Terminal-state webhooks** — `simulation.succeeded/failed` and
  `evaluation.succeeded/failed` now fan out to the caller's callbackUrl + org
  endpoints from the runners.
- **✅ Cancel endpoints** — POST /simulations/:id/cancel and
  /evaluations/:id/cancel (CAS run + director to cancelled, release the hold,
  idempotent on terminal runs).
- **✅ Webhook-delivery retention** — terminal deliveries older than 30 days are
  pruned on the worker tick (ledger/audit/logs stay append-only by design).
- **✅ Dashboard pages** — Simulations (list + detail), Schedules, Evaluations,
  Artifacts (with session-authenticated downloads), and balance / burn-rate /
  runway / auto-reload tiles on Usage & spend; all in the sidebar.
- **✅ SDK 0.2.0** — full coverage of the new surfaces: simulations (run /
  estimate / get / cancel / replay / frameworks), schedules, artifacts
  (upload / list / download), evaluations, approvals, billing, and job/swarm
  replay + cancel.

Still open (needs accounts/credentials, not code): a real TopUpProvider
processor adapter, the live Modal `/simulate` smoke run, Playwright e2e, and
the connector-marketplace ecosystem build-out.
