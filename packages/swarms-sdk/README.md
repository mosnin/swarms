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

// Free execution
const job = await client.executeSkill({
  skillSlug: "web-summarize",
  input: { url: "https://example.com" },
  idempotencyKey: generateIdempotencyKey(),
});

for await (const log of client.streamJobLogs(job.jobId)) {
  console.log(log.level, log.message);
}

// Paid execution (x402) — provide a signer that wraps your wallet/facilitator
const result = await client.executePaidSkill(
  { skillSlug: "code-review", input: { repo: "acme/app" }, idempotencyKey: generateIdempotencyKey() },
  { signer: myX402Signer },
);

// Swarms
const run = await client.runSwarm({
  templateId,
  objective: "Analyze a competitor",
  ...budget(5000),
});
```

## Surface

| Method | Endpoint |
|---|---|
| `executeSkill` | `POST /api/v1/execute` |
| `executePaidSkill` | `POST /api/v1/execute-paid` (x402) |
| `getJob` / `cancelJob` | `GET/POST /api/v1/jobs/:id[/cancel]` |
| `getJobLogs` / `streamJobLogs` | `GET /api/v1/jobs/:id/logs` (stream = poll placeholder) |
| `runSwarm` / `getSwarmRun` | `POST /api/v1/swarms/run`, `GET /api/v1/swarms/:id` |

Helpers: `generateIdempotencyKey()`, `toMinorUnits()`, `budget()`. Errors are
typed (`SwarmsError`, `SwarmsNetworkError`). All responses are validated
with Zod against the server contract.

## Payments

The SDK never holds wallet keys. Implement `PaymentSigner` to turn the server's
x402 `PaymentRequirements` into an `X-PAYMENT` header; `executePaidSkill` handles
the 402 challenge/retry handshake.
