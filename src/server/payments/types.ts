/**
 * Payment provider abstraction for x402-style pay-per-call execution. The
 * control plane depends only on this port; concrete providers (a local mock for
 * development, the real x402/EVM facilitator for production) are selected by
 * validated configuration. No wallet address or network is ever hardcoded.
 *
 * The security-critical property is *binding*: a payment is cryptographically
 * tied to the exact (skill version, organization, idempotency key, price)
 * tuple, so it can never be replayed for a different job. That binding logic is
 * provider-independent and lives in `payment-service.ts`.
 */

export interface PaymentBinding {
  organizationId: string;
  skillVersionId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  /** Receiving address / account; comes from validated config, never hardcoded. */
  payTo: string;
  amountMinor: number;
  currency: string;
  /** Single-use challenge nonce. */
  nonce: string;
  /** Hex digest binding this challenge to the exact request. */
  binding: string;
  expiresAt: string;
}

/** Proof presented by the caller (decoded from the `X-PAYMENT` header). */
export interface PaymentProof {
  scheme: string;
  nonce: string;
  binding: string;
  /** Settlement reference (on-chain tx hash for real providers). */
  txRef: string;
}

export type VerificationResult =
  | { ok: true; txRef: string; providerRef?: string }
  | { ok: false; reason: string };

export interface PaymentProvider {
  readonly scheme: string;
  /** Build the challenge a 402 response advertises for a given binding. */
  challenge(binding: PaymentBinding, nonce: string, bindingDigest: string): PaymentRequirements;
  /** Verify a presented proof settles the expected binding/amount. */
  verify(proof: PaymentProof, requirements: PaymentRequirements): Promise<VerificationResult>;
}
