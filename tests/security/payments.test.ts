/**
 * Security: x402 payment binding prevents the highest-impact financial abuses —
 * paying once and reusing it, funding a different request, or double-charging.
 */

import { describe, expect, it } from "vitest";

import {
  bindingDigest,
  settlePayment,
  type PaymentAttemptRecord,
  type PaymentReceiptRecord,
  type PaymentStore,
} from "@/modules/billing/payment-service";
import type { LedgerEntryRecord, LedgerStore } from "@/modules/billing/ledger-service";
import { MockPaymentProvider } from "@/server/payments/mockProvider";
import type { PaymentBinding, PaymentProof } from "@/server/payments/types";

class Ledger implements LedgerStore {
  entries: LedgerEntryRecord[] = [];
  async insert(r: LedgerEntryRecord) {
    this.entries.push(r);
    return r;
  }
  async findById(id: string) {
    return this.entries.find((e) => e.id === id) ?? null;
  }
  async listByOrganization(org: string) {
    return this.entries.filter((e) => e.organizationId === org);
  }
}

class Store implements PaymentStore {
  attempts: PaymentAttemptRecord[] = [];
  receipts: PaymentReceiptRecord[] = [];
  async insertAttempt(r: PaymentAttemptRecord) {
    this.attempts.push(r);
    return r;
  }
  async insertReceipt(r: PaymentReceiptRecord) {
    if (this.receipts.some((x) => x.organizationId === r.organizationId && x.txRef === r.txRef)) {
      throw new Error("unique(org,txRef) violated");
    }
    this.receipts.push(r);
    return r;
  }
  async findReceiptByBinding(org: string, b: string) {
    return this.receipts.find((r) => r.organizationId === org && r.binding === b) ?? null;
  }
  async findReceiptByTxRef(org: string, tx: string) {
    return this.receipts.find((r) => r.organizationId === org && r.txRef === tx) ?? null;
  }
  async bindReceiptToJob() {}
}

const provider = new MockPaymentProvider("0xPAYTO");
const binding: PaymentBinding = {
  organizationId: "org_a",
  skillVersionId: "skv_1",
  idempotencyKey: "idem-1",
  amountMinor: 500,
  currency: "USD",
};
const proof = (b: PaymentBinding, txRef = "0xtx_aaaa1111"): PaymentProof => ({
  scheme: "x402-mock",
  nonce: "n",
  binding: bindingDigest(b),
  txRef,
});

describe("payment cannot be replayed or reused", () => {
  it("blocks a settlement reference reused for a different request", async () => {
    const store = new Store();
    const ledger = new Ledger();
    await settlePayment(store, provider, ledger, binding, proof(binding, "0xSHARED"));
    const other = { ...binding, idempotencyKey: "idem-2" };
    await expect(settlePayment(store, provider, ledger, other, proof(other, "0xSHARED"))).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("does not double-charge the same idempotent request", async () => {
    const store = new Store();
    const ledger = new Ledger();
    const a = await settlePayment(store, provider, ledger, binding, proof(binding, "0xtx_0001"));
    const b = await settlePayment(store, provider, ledger, binding, proof(binding, "0xtx_0002"));
    expect(b.replay).toBe(true);
    expect(b.receipt.id).toBe(a.receipt.id);
    expect(store.receipts).toHaveLength(1);
  });

  it("rejects a proof bound to a different amount", async () => {
    const store = new Store();
    const ledger = new Ledger();
    const tampered = { ...binding, amountMinor: 100 };
    // proof is bound to the 100-amount binding, but we settle the 500 binding.
    await expect(settlePayment(store, provider, ledger, binding, proof(tampered))).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
    });
  });

  it("rejects a proof for a different skill version", async () => {
    const store = new Store();
    const ledger = new Ledger();
    const otherSkill = { ...binding, skillVersionId: "skv_999" };
    await expect(settlePayment(store, provider, ledger, binding, proof(otherSkill))).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
    });
  });
});
