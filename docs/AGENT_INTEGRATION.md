# Agent Integration

How an autonomous AI agent integrates with Swarms to spawn sandboxed worker
agents that inherit its context, secrets, files, and tools.

## 1. Get an API key

In the dashboard, create a key scoped to the permissions the agent needs
(typically `jobs.create`, `jobs.read`, `jobs.cancel`, `connectors.read`). The
key is shown once.

## 2. Install the SDK

```bash
npm install @swarms/sdk zod
```

## 3. Spawn a worker agent

```ts
import { SwarmsClient, generateIdempotencyKey, budget } from "@swarms/sdk";

const client = new SwarmsClient({
  baseUrl: process.env.SWARMS_URL!,
  apiKey: process.env.SWARMS_API_KEY!,
});

const agent = await client.spawnAgent({
  task: "Read spec.md and summarize the risks.",
  resources: { files: { "spec.md": "..." }, context: "Launch is in Q4." },
  idempotencyKey: generateIdempotencyKey(),
  ...budget(500),
});

for await (const log of client.streamJobLogs(agent.jobId)) console.log(log.message);
const final = await client.getJob(agent.jobId);
```

The worker inherits the resources you pass: files become `read_file` tools, MCP
servers become callable tools, and secrets are used as tool auth (never returned).

## 4. Spawn a workforce (swarm)

```ts
const swarm = await client.spawnSwarm({
  objective: "Analyze a competitor",
  tasks: ["Summarize their pricing", "List positioning claims", "Propose risks"],
  resources: { context: "We sell a competing tool." },
  idempotencyKey: generateIdempotencyKey(),
  ...budget(5000),
});
// one worker per task, sharing the resources, under one aggregate budget
```

## 5. Payments (x402)

Compute is metered per second and charged against the org budget; on-chain
settlement is via x402. See [`X402_PAYMENT_INTEGRATION.md`](./X402_PAYMENT_INTEGRATION.md).

## Idempotency & retries

Always pass a stable `idempotencyKey` per logical action. Retrying with the same
key is safe (same job, no double charge). A different input under the same key is
rejected — see [`ERRORS.md`](./ERRORS.md).

## What the platform enforces for you

Authorization, organization isolation, **policy** (allow/deny/approval),
**budgets** (hard-stop), **payment binding** (x402), append-only **usage
ledger**, and **audit**. Your agent does not manage accounts, infra, or worker
isolation.
