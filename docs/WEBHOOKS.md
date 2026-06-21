# Webhooks

> Status: **implemented** (signed, retried, at-least-once). Per-org secret
> rotation is future work (a single configured signing secret is used today).

## Subscribing

Pass `callbackUrl` on `POST /api/v1/execute`. When the job reaches a terminal
state, Hermes Cloud delivers a signed event to that URL.

## Event shape

The body is **canonical JSON** (keys sorted recursively, so the signed bytes are
stable regardless of property order):

```json
{
  "data": { "status": "succeeded", "costMinor": 200, "currency": "USD" },
  "jobId": "job_...",
  "occurredAt": "2026-...",
  "organizationId": "org_...",
  "type": "job.succeeded"
}
```

Event types today: `job.succeeded`, `job.failed`. (More — `payment.verified`,
`swarm.completed` — can be added via `enqueueWebhook`.)

## Headers

| Header | Value |
|---|---|
| `X-Hermes-Event` | the event type (e.g. `job.succeeded`) |
| `X-Hermes-Signature` | `HMAC-SHA256(secret, body)` as hex |

## Verifying (consumer)

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret: string, rawBody: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Verify over the **raw body bytes** you receive. Treat delivery as idempotent
(dedupe on `jobId` + `type`); retries can re-deliver.

## Delivery semantics

- **Durable outbox**: events are written to `webhook_deliveries` and delivered by
  the worker, so a delivery is never lost if the consumer is briefly down.
- **At-least-once** with bounded exponential backoff (`maxAttempts` = 5); after
  the last attempt the delivery is marked `failed` with `lastError`.
- **10s timeout** per attempt; non-2xx is a retryable failure.

## Configuration

| Var | Notes |
|---|---|
| `WEBHOOK_SIGNING_SECRET` | HMAC secret (≥16 chars). Required in production; a fixed dev secret is used otherwise. |

## Not yet

- Per-org signing secrets + rotation (single shared secret today).
- Event types beyond job terminal states wired into all flows.
- A management UI for endpoints/secrets.
