/**
 * Integration: x402 settlement is wired to the append-only ledger end-to-end.
 * A settled payment persists a receipt AND a matching `payment` ledger credit,
 * so reconciliation reports no drift (previously receipts had no ledger entry
 * and every one would have been flagged as `missing_payment_entry`).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { bindingDigest, settlePayment } from "@/modules/billing/payment-service";
import { dbPaymentStore } from "@/modules/billing/payment-repository";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";
import { reconcileOrganization } from "@/modules/billing/reconciliation";
import { MockPaymentProvider } from "@/server/payments/mockProvider";
import type { PaymentBinding } from "@/server/payments/types";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: x402 settlement → ledger", () => {
  let db: TestDb;
  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => __setTestDb(undefined));

  it("persists a receipt + payment ledger credit and reconciles clean", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-pay-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const provider = new MockPaymentProvider("0xPAYTO", "base-sepolia");
    const binding: PaymentBinding = {
      organizationId,
      skillVersionId: "skv_1",
      idempotencyKey: "pay-int-0001",
      amountMinor: 500,
      currency: "USD",
    };
    const proof = { scheme: "x402-mock", nonce: "n1", binding: bindingDigest(binding), txRef: "0xtx_int_1" };

    const { receipt, replay } = await settlePayment(
      dbPaymentStore(db),
      provider,
      dbLedgerStore(db),
      binding,
      proof,
    );
    expect(replay).toBe(false);

    // Receipt persisted (fresh test DB → exactly one).
    const receipts = await db.select().from(schema.x402PaymentReceipts);
    expect(receipts.length).toBe(1);

    // Ledger credit persisted, bound to the receipt.
    const entries = await db.select().from(schema.usageLedgerEntries);
    const paymentEntry = entries.find((e) => e.kind === "payment" && e.refId === receipt.id);
    expect(paymentEntry).toBeTruthy();
    expect(paymentEntry?.direction).toBe("credit");
    expect(paymentEntry?.amountMinor).toBe(500);

    // Reconciliation finds no drift.
    const report = await reconcileOrganization(ctx, db);
    expect(report.ok).toBe(true);
    expect(report.receiptsChecked).toBe(1);
    expect(report.discrepancies).toEqual([]);
  });
});
