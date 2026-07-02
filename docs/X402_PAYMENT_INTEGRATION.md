# x402 Payment Integration

> Status: **testnet/mock provider**. The real on-chain provider is selected via
> config and **fails closed** until wired. Mainnet is gated — see
> [`KNOWN_RISKS.md`](./KNOWN_RISKS.md) (KR-2) and the mainnet checklist in
> [`DEPLOYMENT_TOPOLOGY.md`](./DEPLOYMENT_TOPOLOGY.md).

## Flow

```
agent ──POST /api/v1/execute-paid (no X-PAYMENT)──▶ 402 + { accepts: [requirements] }
agent ──sign(requirements) -> X-PAYMENT header────▶ POST again
server ──verify + settle + bind receipt to job────▶ 201 { jobId, ... }
```

1. The server computes a **binding digest** over
   `(organizationId, skillVersionId, idempotencyKey, amount, currency)` and
   returns `PaymentRequirements` (scheme, network, payTo, amount, nonce,
   binding, expiresAt) with HTTP **402**.
2. The client signs the requirements into an `X-PAYMENT` header (base64 JSON
   proof: `{ scheme, nonce, binding, txRef }`).
3. The server verifies via the configured provider, then enforces:
   - proof bound to **this** request (binding match),
   - settlement reference (`txRef`) used **at most once** (unique `(org, txRef)`),
   - idempotent settle (same request → same receipt, no double charge).
4. On success it binds the receipt to an idempotently-created job, records a
   funding ledger credit (and marketplace split), and enqueues the job.

## Configuration (env)

| Var | Default | Notes |
|---|---|---|
| `X402_PROVIDER` | `mock` | `mock` (dev/testnet stand-in) or `x402` (real). |
| `X402_NETWORK` | `base-sepolia` | Testnet by default. |
| `X402_PAY_TO_ADDRESS` | — | Receiving address. **Never hardcoded.** Required for `x402`. |
| `X402_FACILITATOR_URL` | — | Required for `x402`. |

`mock` is refused in production; `x402` without address/facilitator fails closed.

## Security properties (tested)

- Same payment cannot fund two jobs (`tests/security/payments.test.ts`).
- Same idempotency key does not double-charge.
- Proof bound to wrong amount/skill version is rejected.
- Failed verification creates no executable job.

## SDK

`SwarmsClient.executePaidSkill(params, { signer })` handles the 402
challenge/retry. Implement `PaymentSigner.sign(requirements) -> string`
(base64 proof). The SDK never holds wallet keys.
