import { describe, expect, it, vi } from "vitest";

import { X402FacilitatorProvider } from "@/server/payments/x402Provider";
import { bindingDigest } from "@/modules/billing/payment-service";
import type { PaymentBinding } from "@/server/payments/types";

const binding: PaymentBinding = {
  organizationId: "org_1",
  skillVersionId: "skv_1",
  idempotencyKey: "idem-1",
  amountMinor: 500,
  currency: "USD",
};

function provider(fetchImpl: typeof fetch) {
  return new X402FacilitatorProvider({
    facilitatorUrl: "https://facilitator.test/",
    payTo: "0xPAYTO",
    network: "base",
    fetchImpl,
  });
}

function proofFor(p = provider(fetch)) {
  const req = p.challenge(binding, "nonce-1", bindingDigest(binding));
  return { req, proof: { scheme: "exact", nonce: "nonce-1", binding: req.binding, txRef: "0xpending" } };
}

describe("X402FacilitatorProvider", () => {
  it("verifies + settles via the facilitator and returns the tx ref", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("/verify")) return new Response(JSON.stringify({ isValid: true }), { status: 200 });
      if (u.endsWith("/settle"))
        return new Response(JSON.stringify({ success: true, transaction: "0xabc123def456" }), { status: 200 });
      return new Response("no", { status: 404 });
    });
    const p = provider(fetchMock as unknown as typeof fetch);
    const { req, proof } = proofFor(p);
    const res = await p.verify(proof, req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.txRef).toBe("0xabc123def456");
      expect(res.providerRef).toContain("x402:base:");
    }
  });

  it("rejects a proof not bound to the challenge without calling the network", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const p = provider(fetchMock as unknown as typeof fetch);
    const { req } = proofFor(p);
    const res = await p.verify({ scheme: "exact", nonce: "nonce-1", binding: "wrong", txRef: "0xpending" }, req);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the facilitator marks the payment invalid", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ isValid: false, invalidReason: "insufficient_funds" }), { status: 200 }),
    );
    const p = provider(fetchMock as unknown as typeof fetch);
    const { req, proof } = proofFor(p);
    const res = await p.verify(proof, req);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("insufficient_funds");
  });

  it("maps a facilitator HTTP error to a typed failure (no throw)", async () => {
    const fetchMock = vi.fn(async () => new Response("err", { status: 502 }));
    const p = provider(fetchMock as unknown as typeof fetch);
    const { req, proof } = proofFor(p);
    const res = await p.verify(proof, req);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("502");
  });
});
