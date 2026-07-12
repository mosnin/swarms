/**
 * TopUpProvider port — the seam that captures money from an organization's saved
 * payment method during auto-reload. Kept behind a port so the auto-reload
 * logic (threshold detection, idempotent crediting, rate-limiting) is fully
 * testable without a real processor.
 *
 *  - MockTopUpProvider: always succeeds (dev/test).
 *  - NoneTopUpProvider: always declines (auto-reload effectively off).
 *
 * Production registers a real adapter (Stripe off-session charge, an x402
 * mandate, etc.) that performs the actual capture and returns a provider ref.
 */

import { env } from "@/lib/env";

export interface TopUpRequest {
  organizationId: string;
  amountMinor: number;
  currency: string;
  /** Deterministic per reload window — the adapter must dedupe on it. */
  idempotencyKey: string;
}

export type TopUpResult =
  | { ok: true; providerRef: string }
  | { ok: false; reason: string };

export interface TopUpProvider {
  readonly kind: string;
  capture(req: TopUpRequest): Promise<TopUpResult>;
}

export class MockTopUpProvider implements TopUpProvider {
  readonly kind = "mock";
  async capture(req: TopUpRequest): Promise<TopUpResult> {
    return { ok: true, providerRef: `mock-topup-${req.idempotencyKey}` };
  }
}

export class NoneTopUpProvider implements TopUpProvider {
  readonly kind = "none";
  async capture(): Promise<TopUpResult> {
    return { ok: false, reason: "No top-up provider configured" };
  }
}

let provider: TopUpProvider | undefined;

export function getTopUpProvider(): TopUpProvider {
  if (provider) return provider;
  provider = env.TOPUP_PROVIDER === "none" ? new NoneTopUpProvider() : new MockTopUpProvider();
  return provider;
}

/** Test seam. */
export function setTopUpProvider(next: TopUpProvider | undefined): void {
  provider = next;
}
