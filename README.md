# Swarms

**An on-demand labor force for AI agents.** Your agent spawns sandboxed worker
agents to do basic tasks — handing them the same resources it has (secrets,
files, MCP tools, context). They run on GPU rented by the second and paid for
with x402, and a budget is a hard ceiling so they can't overspend.

```ts
import { SwarmsClient, generateIdempotencyKey, budget } from "@swarms/sdk";

const client = new SwarmsClient({ baseUrl, apiKey });

const run = await client.spawnAgent({
  task: "Read the notes and draft three follow-up tasks.",
  resources: { context: "Q3 planning notes", env: { NOTION_TOKEN } },
  idempotencyKey: generateIdempotencyKey(),
  ...budget(200), // hard GPU-time ceiling
});
```

## Why it matters

A spawned worker with no context and no resources can't do anything. Swarms'
defining feature is **resource inheritance**: the worker gets what your
agent has, so it can actually do the work — in isolation, metered, and within a
budget it cannot exceed.

## Run it

```bash
docker compose up --build      # postgres + web (control plane) + worker
# open http://localhost:3000  → "Spawn an agent"
```

Local dev: `npm run dev` (web) and `npm run worker` (worker), with a Postgres
`DATABASE_URL`.

## Docs

- [Product spec](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) ·
  [Security model](docs/SECURITY_MODEL.md)
- [Sandbox runtime](docs/SANDBOX_RUNTIME.md) · [x402 payments](docs/X402_PAYMENT_INTEGRATION.md)
- [Worker runtime](docs/WORKER_RUNTIME.md) · [Deployment](docs/DEPLOYMENT_TOPOLOGY.md) ·
  [Known risks](docs/KNOWN_RISKS.md)

## Status

Engine, sandbox, payments, budgets/policy, audit, SDK, and the spawn flow are
implemented and tested (in-process Postgres integration tests). The agent runtime
ships a deterministic mock for dev/test and an Anthropic-backed runtime gated by
`AGENT_RUNTIME=anthropic`. See [docs/KNOWN_RISKS.md](docs/KNOWN_RISKS.md).
