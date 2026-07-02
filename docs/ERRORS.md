# Error Reference

All API errors use the envelope `{ "error": { code, message, retryable, details? } }`.
Codes are stable; internal causes are never serialized.

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `VALIDATION` | 400 | no | Request/body/input failed validation. `details.issues` lists problems. |
| `UNAUTHORIZED` | 401 | no | Missing/invalid credentials. |
| `FORBIDDEN` | 403 | no | Authenticated but not permitted (permission or cross-tenant). |
| `POLICY_DENIED` | 403 | no | Blocked by an org policy rule. |
| `NOT_FOUND` | 404 | no | Resource missing or not visible to you. |
| `CAPABILITY_NOT_FOUND` | 404 | no | Skill/version not found or not published. |
| `CONFLICT` | 409 | no | State conflict (e.g. illegal job transition, txRef reuse). |
| `IDEMPOTENCY_CONFLICT` | 409 | no | Idempotency key reused with a different request. |
| `PAYMENT_REQUIRED` | 402 | no | Payment required or verification failed (x402). |
| `BUDGET_EXCEEDED` | 402 | no | Hard-stop budget would be exceeded. |
| `RATE_LIMITED` | 429 | yes | Too many requests (reserved; not yet enforced). |
| `SANDBOX_FAILURE` | 500 | yes | Sandbox/runner failure. |
| `UPSTREAM_ERROR` | 502 | yes | External/connector call failed. |
| `CONFIG_ERROR` | 500 | no | Server misconfiguration (e.g. unconfigured payment provider). |
| `INTERNAL` | 500 | no | Unexpected server error (no internals leaked). |

## Handling guidance

- `IDEMPOTENCY_CONFLICT`: you reused a key with different input — generate a new
  key or send the original input.
- `PAYMENT_REQUIRED` on `execute-paid`: the body includes `accepts: [requirements]`
  with HTTP 402 — sign and retry with the `X-PAYMENT` header.
- `BUDGET_EXCEEDED` / `POLICY_DENIED`: surfaced before any execution; no charge,
  no worker run.
- `retryable: true` codes are safe to retry with backoff.
