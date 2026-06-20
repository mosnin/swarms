# Hermes Agent Integration

How an autonomous agent — the **Hermes agent (Nous Research)** or any Node agent —
integrates with Hermes Cloud.

> Hermes Cloud is the platform. "Hermes" (the agent) refers to Nous Research's
> Hermes agent, the primary client. The SDK is a generic client; no affiliation
> is implied.

## 1. Get an API key

In the dashboard, create a key scoped to the permissions the agent needs
(typically `skills.read`, `skills.execute`, `jobs.create`, `jobs.read`,
`jobs.cancel`, `connectors.read`). The key is shown once.

## 2. Install the SDK

```bash
npm install @hermes-cloud/sdk zod
```

## 3. Execute a skill

```ts
import { HermesCloudClient, generateIdempotencyKey, budget } from "@hermes-cloud/sdk";

const client = new HermesCloudClient({
  baseUrl: process.env.HERMES_CLOUD_URL!,
  apiKey: process.env.HERMES_CLOUD_API_KEY!,
});

const job = await client.executeSkill({
  skillSlug: "web-summarize",
  input: { url: "https://example.com" },
  idempotencyKey: generateIdempotencyKey(),
  ...budget(500),
});

for await (const log of client.streamJobLogs(job.jobId)) console.log(log.message);
const final = await client.getJob(job.jobId);
```

## 4. Paid execution (x402)

Provide a `PaymentSigner` that wraps your wallet/facilitator; the SDK handles the
402 challenge/retry. See [`X402_PAYMENT_INTEGRATION.md`](./X402_PAYMENT_INTEGRATION.md).

## 5. Swarms

```ts
const run = await client.runSwarm({ templateId, objective: "Analyze a competitor", ...budget(5000) });
```

## Idempotency & retries

Always pass a stable `idempotencyKey` per logical action. Retrying with the same
key is safe (same job, no double charge). A different input under the same key is
rejected — see [`ERRORS.md`](./ERRORS.md).

## What the platform enforces for you

Authorization, organization isolation, **policy** (allow/deny/approval),
**budgets** (hard-stop), **payment binding** (paid skills), append-only **usage
ledger**, and **audit**. Your agent does not manage accounts, infra, or worker
isolation.
