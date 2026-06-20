# Webhooks

> Status: **placeholder / not yet delivered.** This documents the intended
> contract so integrators can plan; delivery is not implemented (see
> [`KNOWN_RISKS.md`](./KNOWN_RISKS.md)).

## Intent

`POST /api/v1/execute` accepts an optional `callbackUrl`. When webhook delivery
is implemented, Hermes Cloud will POST job lifecycle events to that URL so agents
do not have to poll.

## Planned event shape

```json
{
  "type": "job.succeeded",
  "jobId": "job_...",
  "organizationId": "org_...",
  "status": "succeeded",
  "occurredAt": "2026-...",
  "data": { "costMinor": 200, "currency": "USD" }
}
```

Planned event types mirror audit actions: `job.succeeded`, `job.failed`,
`job.cancelled`, `payment.verified`, `swarm.completed`.

## Planned security

- Signed with an HMAC over the body using a per-org webhook secret
  (`X-Hermes-Signature`).
- At-least-once delivery with retries + exponential backoff.
- Consumers must verify the signature and treat delivery as idempotent (dedupe
  on `jobId` + `type`).

Until implemented, use `GET /api/v1/jobs/{jobId}` / `streamJobLogs` to observe
completion.
