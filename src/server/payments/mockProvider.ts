/**
 * LOCAL DEV ADAPTER — mock x402 payment provider (testnet stand-in).
 *
 * Produces deterministic challenges and "settles" a proof when its nonce and
 * binding match the challenge. It performs NO real on-chain settlement and must
 * never be enabled in production — the real provider verifies settlement via the
 * configured x402 facilitator. This adapter exists so the full paid-execution
 * flow (challenge → pay → verify → bind receipt → run) is testable offline.
 */

import { toIso } from "@/lib/time";
import type {
  PaymentBinding,
  PaymentProof,
  PaymentProvider,
  PaymentRequirements,
  VerificationResult,
} from "@/server/payments/types";

export const MOCK_SCHEME = "x402-mock";

export class MockPaymentProvider implements PaymentProvider {
  readonly scheme = MOCK_SCHEME;

  constructor(
    private readonly payTo: string,
    private readonly network = "base-sepolia",
    private readonly ttlMs = 5 * 60_000,
  ) {}

  challenge(binding: PaymentBinding, nonce: string, bindingDigest: string): PaymentRequirements {
    return {
      scheme: this.scheme,
      network: this.network,
      payTo: this.payTo,
      amountMinor: binding.amountMinor,
      currency: binding.currency,
      nonce,
      binding: bindingDigest,
      expiresAt: toIso(Date.now() + this.ttlMs),
    };
  }

  async verify(
    proof: PaymentProof,
    requirements: PaymentRequirements,
  ): Promise<VerificationResult> {
    if (proof.scheme !== this.scheme) {
      return { ok: false, reason: "Unsupported payment scheme" };
    }
    if (proof.nonce !== requirements.nonce) {
      return { ok: false, reason: "Payment nonce does not match challenge" };
    }
    if (proof.binding !== requirements.binding) {
      return { ok: false, reason: "Payment is not bound to this request" };
    }
    if (!proof.txRef || proof.txRef.length < 8) {
      return { ok: false, reason: "Missing settlement reference" };
    }
    // Mock settlement is considered successful at this point.
    return { ok: true, txRef: proof.txRef, providerRef: `mock:${proof.txRef}` };
  }
}
