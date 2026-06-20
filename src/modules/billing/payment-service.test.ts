import { beforeEach, describe, expect, it } from "vitest";

import { fixedClock } from "@/lib/time";
import {
  bindingDigest,
  decodePaymentHeader,
  issueChallenge,
  settlePayment,
  type PaymentAttemptRecord,
  type PaymentReceiptRecord,
  type PaymentStore,
} from "@/modules/billing/payment-service";
import { MockPaymentProvider } from "@/server/payments/mockProvider";
import type { PaymentBinding, PaymentProof } from "@/server/payments/types";

class InMemoryPaymentStore implements PaymentStore {
  readonly attempts: PaymentAttemptRecord[] = [];
  readonly receipts: PaymentReceiptRecord[] = [];

  async insertAttempt(record: PaymentAttemptRecord) {
    this.attempts.push(record);
    return record;
  }
  async insertReceipt(record: PaymentReceiptRecord) {
    if (this.receipts.some((r) => r.organizationId === record.organizationId && r.txRef === record.txRef)) {
      throw new Error("duplicate txRef"); // mirrors the DB unique index
    }
    this.receipts.push(record);
    return record;
  }
  async findReceiptByBinding(organizationId: string, binding: string) {
    return this.receipts.find((r) => r.organizationId === organizationId && r.binding === binding) ?? null;
  }
  async findReceiptByTxRef(organizationId: string, txRef: string) {
    return this.receipts.find((r) => r.organizationId === organizationId && r.txRef === txRef) ?? null;
  }
  async bindReceiptToJob(receiptId: string, jobId: string) {
    const r = this.receipts.find((x) => x.id === receiptId);
    if (r) r.jobId = jobId;
  }
}

const clock = fixedClock(new Date("2026-04-01T00:00:00Z"));
const provider = new MockPaymentProvider("0xPAYTO", "base-sepolia");

const binding: PaymentBinding = {
  organizationId: "org_1",
  skillVersionId: "skv_1",
  idempotencyKey: "idem-pay-0001",
  amountMinor: 500,
  currency: "USD",
};

function validProof(b = binding, txRef = "0xtx_abcdef12"): PaymentProof {
  return { scheme: "x402-mock", nonce: "nonce_x", binding: bindingDigest(b), txRef };
}

describe("bindingDigest", () => {
  it("is stable and request-specific", () => {
    expect(bindingDigest(binding)).toBe(bindingDigest({ ...binding }));
    expect(bindingDigest({ ...binding, amountMinor: 501 })).not.toBe(bindingDigest(binding));
    expect(bindingDigest({ ...binding, skillVersionId: "skv_2" })).not.toBe(bindingDigest(binding));
  });
});

describe("issueChallenge (unpaid path)", () => {
  it("returns requirements bound to the request and records a pending attempt", async () => {
    const store = new InMemoryPaymentStore();
    const req = await issueChallenge(store, provider, binding, clock);
    expect(req.amountMinor).toBe(500);
    expect(req.binding).toBe(bindingDigest(binding));
    expect(req.payTo).toBe("0xPAYTO");
    expect(store.attempts[0]?.status).toBe("pending");
  });
});

describe("settlePayment", () => {
  let store: InMemoryPaymentStore;
  beforeEach(() => {
    store = new InMemoryPaymentStore();
  });

  it("settles a valid proof and issues a receipt", async () => {
    const { receipt, replay } = await settlePayment(store, provider, binding, validProof(), clock);
    expect(replay).toBe(false);
    expect(receipt.amountMinor).toBe(500);
    expect(receipt.txRef).toBe("0xtx_abcdef12");
    expect(store.receipts).toHaveLength(1);
  });

  it("is idempotent: re-settling the same binding returns the same receipt (no double charge)", async () => {
    const first = await settlePayment(store, provider, binding, validProof(), clock);
    const second = await settlePayment(store, provider, binding, validProof(binding, "0xDIFFERENTtx"), clock);
    expect(second.replay).toBe(true);
    expect(second.receipt.id).toBe(first.receipt.id);
    expect(store.receipts).toHaveLength(1);
  });

  it("rejects a proof not bound to this request", async () => {
    const wrong = { ...validProof(), binding: "deadbeef" };
    await expect(settlePayment(store, provider, binding, wrong, clock)).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
    });
  });

  it("rejects reusing a settlement reference for a different request (duplicate)", async () => {
    await settlePayment(store, provider, binding, validProof(binding, "0xshared_tx"), clock);
    const otherBinding = { ...binding, idempotencyKey: "idem-pay-0002" };
    await expect(
      settlePayment(store, provider, otherBinding, validProof(otherBinding, "0xshared_tx"), clock),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects an unverifiable proof (bad scheme)", async () => {
    const badScheme = { ...validProof(), scheme: "not-x402" };
    await expect(settlePayment(store, provider, binding, badScheme, clock)).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
    });
  });
});

describe("decodePaymentHeader", () => {
  it("decodes a base64 JSON proof", () => {
    const proof = validProof();
    const header = Buffer.from(JSON.stringify(proof)).toString("base64");
    expect(decodePaymentHeader(header)).toEqual(proof);
  });

  it("returns null for missing/garbage headers", () => {
    expect(decodePaymentHeader(null)).toBeNull();
    expect(decodePaymentHeader("not-base64-json!!")).toBeNull();
  });
});
