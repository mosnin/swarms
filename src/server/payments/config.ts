/**
 * Payment provider selection from validated configuration. Returns the mock
 * provider for local development and (when wired) the real x402 facilitator
 * provider in production. The receiving address must come from configuration —
 * if a real provider is selected without a pay-to address, we fail closed.
 */

import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { MockPaymentProvider } from "@/server/payments/mockProvider";
import type { PaymentProvider } from "@/server/payments/types";

let provider: PaymentProvider | undefined;

export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;

  if (env.X402_PROVIDER === "x402") {
    // Real settlement requires a configured facilitator + receiving address.
    if (!env.X402_PAY_TO_ADDRESS || !env.X402_FACILITATOR_URL) {
      throw Errors.config("x402 provider selected but X402_PAY_TO_ADDRESS/FACILITATOR_URL are unset");
    }
    // The concrete x402/EVM adapter is wired here once the facilitator deps are
    // installed; until then we fail closed rather than silently using the mock.
    throw Errors.config("Real x402 provider adapter is not yet wired in this build");
  }

  // Mock provider. In production this is refused (payments must be real).
  if (env.NODE_ENV === "production") {
    throw Errors.config("Mock payment provider is not permitted in production");
  }
  const payTo = env.X402_PAY_TO_ADDRESS ?? "0xMOCKpayToAddressForLocalDevelopmentOnly";
  provider = new MockPaymentProvider(payTo, env.X402_NETWORK);
  return provider;
}

/** Test seam. */
export function setPaymentProvider(p: PaymentProvider | undefined): void {
  provider = p;
}
