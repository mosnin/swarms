/**
 * Real x402 payment provider backed by an HTTP facilitator (the x402 standard
 * verify/settle service). It builds standards-shaped payment requirements and
 * verifies a presented payment payload by calling the facilitator's `/verify`
 * (and, when the proof is not yet settled, `/settle`) endpoints.
 *
 * Network, receiving address, and facilitator URL all come from validated env —
 * nothing is hardcoded. Every external call has a timeout and maps failures to
 * the typed result; it never throws raw.
 */

import { toIso } from "@/lib/time";
import { logger } from "@/lib/logger";
import type {
  PaymentBinding,
  PaymentProof,
  PaymentProvider,
  PaymentRequirements,
  VerificationResult,
} from "@/server/payments/types";

export const X402_SCHEME = "exact";

export interface X402FacilitatorOptions {
  facilitatorUrl: string;
  payTo: string;
  network: string;
  /** Asset/currency identifier advertised to the client (e.g. USDC address). */
  asset?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  ttlMs?: number;
}

export class X402FacilitatorProvider implements PaymentProvider {
  readonly scheme = X402_SCHEME;
  private readonly doFetch: typeof fetch;

  constructor(private readonly opts: X402FacilitatorOptions) {
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  challenge(binding: PaymentBinding, nonce: string, bindingDigest: string): PaymentRequirements {
    return {
      scheme: this.scheme,
      network: this.opts.network,
      payTo: this.opts.payTo,
      amountMinor: binding.amountMinor,
      currency: binding.currency,
      nonce,
      binding: bindingDigest,
      expiresAt: toIso(Date.now() + (this.opts.ttlMs ?? 5 * 60_000)),
    };
  }

  async verify(
    proof: PaymentProof,
    requirements: PaymentRequirements,
  ): Promise<VerificationResult> {
    // The proof must be bound to this exact challenge before we spend a network
    // call on it (cheap local rejection of mismatched/forged proofs).
    if (proof.binding !== requirements.binding) {
      return { ok: false, reason: "Payment is not bound to this request" };
    }
    if (proof.nonce !== requirements.nonce) {
      return { ok: false, reason: "Payment nonce does not match challenge" };
    }

    const verifyRes = await this.call("/verify", {
      x402Version: 1,
      paymentPayload: this.payloadFor(proof),
      paymentRequirements: this.requirementsFor(requirements),
    });
    if (!verifyRes.ok) return { ok: false, reason: verifyRes.reason };
    if (verifyRes.body?.isValid === false) {
      return { ok: false, reason: String(verifyRes.body?.invalidReason ?? "facilitator rejected payment") };
    }

    // Settle (idempotent at the facilitator) to obtain the on-chain reference.
    const settleRes = await this.call("/settle", {
      x402Version: 1,
      paymentPayload: this.payloadFor(proof),
      paymentRequirements: this.requirementsFor(requirements),
    });
    if (!settleRes.ok) return { ok: false, reason: settleRes.reason };
    if (settleRes.body?.success === false) {
      return { ok: false, reason: String(settleRes.body?.errorReason ?? "settlement failed") };
    }

    const txRef = String(settleRes.body?.transaction ?? settleRes.body?.txHash ?? proof.txRef);
    if (!txRef || txRef.length < 8) {
      return { ok: false, reason: "facilitator returned no settlement reference" };
    }
    return { ok: true, txRef, providerRef: `x402:${this.opts.network}:${txRef}` };
  }

  private payloadFor(proof: PaymentProof): Record<string, unknown> {
    return { scheme: this.scheme, network: this.opts.network, nonce: proof.nonce, txRef: proof.txRef };
  }

  private requirementsFor(req: PaymentRequirements): Record<string, unknown> {
    return {
      scheme: this.scheme,
      network: req.network,
      payTo: req.payTo,
      maxAmountRequired: String(req.amountMinor),
      asset: this.opts.asset ?? req.currency,
      resource: req.binding,
      nonce: req.nonce,
    };
  }

  private async call(
    path: string,
    body: unknown,
  ): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; reason: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 10_000);
    try {
      const res = await this.doFetch(`${this.opts.facilitatorUrl.replace(/\/+$/, "")}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, reason: `facilitator ${path} returned ${res.status}` };
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: true, body: json };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      logger.error("x402 facilitator call failed", { path, aborted });
      return { ok: false, reason: aborted ? "facilitator call timed out" : "facilitator call failed" };
    } finally {
      clearTimeout(timer);
    }
  }
}
