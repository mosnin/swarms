import { describe, expect, it } from "vitest";

import { reconcile, type LedgerLite } from "@/modules/billing/reconciliation";

const paymentEntry = (receiptId: string, amountMinor: number): LedgerLite => ({
  kind: "payment",
  refType: "payment_receipt",
  refId: receiptId,
  jobId: "job_1",
  amountMinor,
});
const chargeEntry = (jobId: string, amountMinor: number): LedgerLite => ({
  kind: "charge",
  refType: "job",
  refId: jobId,
  jobId,
  amountMinor,
});

describe("reconcile", () => {
  it("reports no discrepancies when ledger matches", () => {
    const d = reconcile(
      [{ id: "r1", jobId: "job_1", amountMinor: 500 }],
      [{ id: "job_1", costMinor: 200 }],
      [paymentEntry("r1", 500), chargeEntry("job_1", 200)],
    );
    expect(d).toEqual([]);
  });

  it("flags a receipt with no matching payment ledger entry", () => {
    const d = reconcile([{ id: "r1", jobId: "job_1", amountMinor: 500 }], [], []);
    expect(d).toEqual([{ kind: "missing_payment_entry", receiptId: "r1" }]);
  });

  it("flags a payment amount mismatch", () => {
    const d = reconcile(
      [{ id: "r1", jobId: "job_1", amountMinor: 500 }],
      [],
      [paymentEntry("r1", 400)],
    );
    expect(d).toMatchObject([
      { kind: "payment_amount_mismatch", receiptId: "r1", expectedMinor: 500, foundMinor: 400 },
    ]);
  });

  it("flags a succeeded chargeable job with no charge entry", () => {
    const d = reconcile([], [{ id: "job_9", costMinor: 300 }], []);
    expect(d).toEqual([{ kind: "missing_charge_entry", jobId: "job_9", expectedMinor: 300 }]);
  });
});
