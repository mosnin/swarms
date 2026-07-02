# @swarms/sdk

TypeScript client for **Swarms** — the on-demand execution layer that
autonomous AI agents call to spawn sandboxed worker agents that inherit
their context, secrets, files, and tools, and pay per GPU-second.

## Install

```bash
npm install @swarms/sdk zod
```

Node ≥ 20 (uses the global `fetch`). The API key is sent as a Bearer token and
is never logged.

## Usage

```ts
import { SwarmsClient, generateIdempotencyKey, budget } from "@swarms/sdk";

const client = new SwarmsClient({
  baseUrl: process.env.SWARMS_URL!,
  apiKey: process.env.SWARMS_API_KEY!,
});

// Spawn a single worker agent that inherits your resources.
const agent = await client.spawnAgent({
  task: "Read spec.md and open a matching issue via the github MCP server.",
  resources: {
    files: { "spec.md": "..." },
    mcpServers: [{ name: "github", url: "https://mcp.example/github", token: "..." }],
  },
  idempotencyKey: generateIdempotencyKey(),
  ...budget(500),
});

for await (const log of client.streamJobLogs(agent.jobId)) {
  console.log(log.level, log.message);
}

// Spawn a workforce: one worker per task, all sharing the same resources,
// under one aggregate budget.
const swarm = await client.spawnSwarm({
  objective: "Prep the launch review",
  tasks: ["Draft the announcement", "List three risks", "Propose a timeline"],
  resources: { context: "Launch is in Q4." },
  idempotencyKey: generateIdempotencyKey(),
  ...budget(1500),
});

console.log(swarm.swarmRunId, swarm.status, "cost:", swarm.costMinor);
```

## Surface

| Method | Endpoint |
|---|---|
| `spawnAgent` | `POST /api/v1/spawn` |
| `spawnSwarm` | `POST /api/v1/swarms` |
| `getSwarmRun` | `GET /api/v1/swarms/:id` |
| `getJob` / `cancelJob` | `GET/POST /api/v1/jobs/:id[/cancel]` |
| `getJobLogs` / `streamJobLogs` | `GET /api/v1/jobs/:id/logs` (stream = poll placeholder) |

Helpers: `generateIdempotencyKey()`, `toMinorUnits()`, `budget()`. Errors are
typed (`SwarmsError`, `SwarmsNetworkError`). All responses are validated
with Zod against the server contract.

## Budget

`budget(n)` sets a hard ceiling in minor units. A spawned agent (or every worker
in a swarm) is metered per second of compute and physically cannot exceed it.
