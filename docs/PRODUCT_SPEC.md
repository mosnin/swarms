# Hermes Cloud — Product Spec

## What it is

**An on-demand labor force for AI agents.** Your agent calls Hermes Cloud to
spawn sandboxed worker agents that do basic tasks for it. The workers run on GPU
rented by the second and paid for with x402.

## The one idea

A spawned worker is useless if it has no context and no resources. So the
defining feature is **resource inheritance**: when your agent spawns a worker, it
hands over the *same* resources it has — secrets, files, MCP tools, and task
context. The worker can actually do the work because it has what your agent has.

## Core loop

```
Your agent → POST /api/v1/spawn { task, resources, budget }
  → resources encrypted at rest, summarized for display (never values)
  → policy + budget gate (budget is a HARD GPU-time ceiling)
  → a sandboxed worker agent runs the task on rented GPU,
     with the inherited resources injected into the sandbox
  → GPU seconds metered → charged once via x402 (cannot exceed budget)
  → structured result + logs + receipt returned
```

## Guarantees

- **Inherits resources** — env/secrets, files, MCP tools, context travel with the
  task; encrypted at rest; injected only into the sandbox; never returned to a
  client.
- **Isolated** — each worker runs in a locked-down container (no network,
  read-only root, dropped caps, no host secrets, CPU/mem/time limits).
- **Can't overspend** — the budget is a hard GPU-second ceiling; the worker is
  stopped at the limit; charging is exactly-once and metered.
- **Accountable** — every spawn is policy-checked, metered, logged, audited, and
  reconcilable against an append-only ledger.

## Surface

- `POST /api/v1/spawn` — spawn a worker agent (the primary call).
- `GET /api/v1/jobs/:id` / `/logs`, `POST .../cancel`, `.../approve` — observe/control runs.
- Dashboard: **Spawn an agent** (the hero), agent runs, GPU spend, approvals,
  budgets, policies, API keys, audit.
- SDK: `client.spawnAgent({ task, resources, budgetMinor, idempotencyKey })`.

## Explicitly NOT this product

- No skill marketplace. No skill registry / catalog. Workers aren't pre-published
  capabilities — they're general agents given a task and your resources.

## Pricing

Compute is metered in **GPU-seconds** (`GPU_RATE_MINOR_PER_SECOND`). The budget
caps the GPU time. Payment is settled via x402 (testnet mock by default; real
facilitator env-gated).

## Architecture (where to look)

| Concern | Location |
|---|---|
| Spawn entry point | `src/modules/agents/spawn-service.ts` |
| Resource inheritance (encrypt/decrypt) | `src/modules/resources/resource-bundle.ts` |
| Agent runtime (mock + Anthropic) | `src/server/agents/*` |
| Sandbox (container isolation) | `src/server/sandbox/*` |
| Job engine / worker | `src/modules/execution/*`, `src/server/jobs/*` |
| Budgets / policy / ledger / x402 | `src/server/budget/*`, `src/server/policy/*`, `src/modules/billing/*` |
