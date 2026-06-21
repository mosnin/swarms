# Swarms API

Base URL: your deployment origin (e.g. `https://cloud.example.com`).
All bodies are JSON. All responses use a standard envelope.

## Authentication

Two principals:

- **Agent (API key)** — `Authorization: Bearer hk_live_...`. Used by your
  autonomous AI agent for the `/api/v1/*` surface.
- **Human session** — dashboard/cookie (and a dev email fallback outside prod).

Keys are created in the dashboard (`POST /api/api-keys`), shown once, hashed at
rest, scoped to permissions, and revocable.

## Response envelope

```json
// success
{ "data": { ... } }
// error
{ "error": { "code": "VALIDATION", "message": "...", "retryable": false, "details": { ... } } }
```

See [`ERRORS.md`](./ERRORS.md) for codes/status. Internal errors never leak
stack traces.

## Idempotency

Every execution requires an `idempotencyKey` (8–255 chars, `[A-Za-z0-9._:-]`).
Repeating the same key with the **same** input returns the same job; a
**different** input returns `IDEMPOTENCY_CONFLICT` (409). Paid execution binds
payment to the key so retries never double-charge.

## Endpoints

### Execution

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/api/v1/execute` | `jobs.create` | Free execution. Policy + budget gated. |
| POST | `/api/v1/execute-paid` | `jobs.create` | x402-gated. Returns 402 + requirements when unpaid. |
| GET | `/api/v1/jobs/{jobId}` | `jobs.read` | Job status/output. |
| GET | `/api/v1/jobs/{jobId}/logs` | `jobs.read` | Execution logs. |
| POST | `/api/v1/jobs/{jobId}/cancel` | `jobs.cancel` | Cancel non-terminal job; releases hold. |
| POST | `/api/v1/jobs/{jobId}/approve` | `policies.manage` | Approve an awaiting_approval job; enqueues. |

`POST /api/v1/execute` body:

```json
{
  "skillSlug": "web-summarize",
  "skillVersion": "1.0.0",
  "input": { "url": "https://example.com" },
  "idempotencyKey": "swarms-...",
  "budgetMinor": 500,
  "currency": "USD"
}
```

Response:

```json
{ "data": {
  "jobId": "job_...", "status": "queued", "paymentRequired": false,
  "estimatedCostMinor": 200, "currency": "USD",
  "executionUrl": "/api/v1/jobs/job_...", "createdAt": "2026-..."
} }
```

### Swarms

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/swarms/run` | `jobs.create` |
| GET | `/api/v1/swarms/{swarmRunId}` | `jobs.read` |
| GET | `/api/v1/swarms/{swarmRunId}/logs` | `jobs.read` |

### Connectors

| Method | Path | Permission |
|---|---|---|
| GET | `/api/connectors` | `connectors.read` |
| POST | `/api/v1/connectors/call` | `connectors.read` |

`call` enforces the job's granted scopes; external-write tools require approval.

### Skills (dashboard/control)

`GET/POST /api/skills`, `GET /api/skills/{id}`,
`POST /api/skills/{id}/versions`, `POST /api/skills/{id}/versions/{versionId}/publish`.

### API keys

`POST /api/api-keys` (returns plaintext once), `GET /api/api-keys`,
`DELETE /api/api-keys/{id}`.

### Ops

`GET /api/health` (liveness), `GET /api/ready` (readiness; checks Postgres),
`GET /api/admin/diagnostics` (owner only).

## Rate limits

Not yet enforced — see [`KNOWN_RISKS.md`](./KNOWN_RISKS.md) (KR-3). Budgets and
policies bound spend in the meantime.

## x402 payments

See [`X402_PAYMENT_INTEGRATION.md`](./X402_PAYMENT_INTEGRATION.md).

## Webhooks

Placeholder — see [`WEBHOOKS.md`](./WEBHOOKS.md). `callbackUrl` is accepted on
execute but delivery is not yet implemented.
