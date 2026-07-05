/**
 * Postgres-backed {@link PaymentStore}: persists x402 payment attempts + receipts
 * to the `x402_payment_attempts` / `x402_payment_receipts` tables. The DB unique
 * indexes (`x402_attempts_org_idem_uq`, `x402_receipts_org_txref_uq`) enforce the
 * single-use guarantees the service relies on. Pairs with `dbLedgerStore` so
 * settlement writes both the receipt and its append-only payment credit.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import type {
  PaymentAttemptRecord,
  PaymentReceiptRecord,
  PaymentStore,
} from "@/modules/billing/payment-service";

type Db = ReturnType<typeof getDb>;

function toAttempt(row: typeof schema.x402PaymentAttempts.$inferSelect): PaymentAttemptRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    jobId: row.jobId,
    idempotencyKey: row.idempotencyKey,
    amountMinor: row.amountMinor,
    currency: row.currency,
    scheme: row.scheme,
    nonce: row.nonce,
    binding: row.binding,
    status: row.status,
    challenge: row.challenge,
    proof: row.proof,
    providerRef: row.providerRef,
    createdAt: row.createdAt,
  };
}

function toReceipt(row: typeof schema.x402PaymentReceipts.$inferSelect): PaymentReceiptRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    jobId: row.jobId,
    paymentAttemptId: row.paymentAttemptId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    txRef: row.txRef,
    binding: row.binding,
    providerRef: row.providerRef,
    createdAt: row.createdAt,
  };
}

export function dbPaymentStore(db: Db = getDb()): PaymentStore {
  return {
    async insertAttempt(record) {
      const row = (
        await db
          .insert(schema.x402PaymentAttempts)
          .values({
            id: record.id,
            organizationId: record.organizationId,
            jobId: record.jobId,
            idempotencyKey: record.idempotencyKey,
            amountMinor: record.amountMinor,
            currency: record.currency,
            scheme: record.scheme,
            nonce: record.nonce,
            binding: record.binding,
            status: record.status,
            challenge: record.challenge ?? null,
            proof: record.proof ?? null,
            providerRef: record.providerRef,
            settledAt: record.status === "settled" ? record.createdAt : null,
            createdAt: record.createdAt,
          })
          .returning()
      )[0];
      if (!row) throw Errors.internal("Failed to insert payment attempt");
      return toAttempt(row);
    },

    async insertReceipt(record) {
      const row = (
        await db
          .insert(schema.x402PaymentReceipts)
          .values({
            id: record.id,
            organizationId: record.organizationId,
            jobId: record.jobId,
            paymentAttemptId: record.paymentAttemptId,
            amountMinor: record.amountMinor,
            currency: record.currency,
            txRef: record.txRef,
            binding: record.binding,
            providerRef: record.providerRef,
            issuedAt: record.createdAt,
            createdAt: record.createdAt,
          })
          .returning()
      )[0];
      if (!row) throw Errors.internal("Failed to insert payment receipt");
      return toReceipt(row);
    },

    async findReceiptByBinding(organizationId, binding) {
      const row = (
        await db
          .select()
          .from(schema.x402PaymentReceipts)
          .where(
            and(
              eq(schema.x402PaymentReceipts.organizationId, organizationId),
              eq(schema.x402PaymentReceipts.binding, binding),
            ),
          )
          .limit(1)
      )[0];
      return row ? toReceipt(row) : null;
    },

    async findReceiptByTxRef(organizationId, txRef) {
      const row = (
        await db
          .select()
          .from(schema.x402PaymentReceipts)
          .where(
            and(
              eq(schema.x402PaymentReceipts.organizationId, organizationId),
              eq(schema.x402PaymentReceipts.txRef, txRef),
            ),
          )
          .limit(1)
      )[0];
      return row ? toReceipt(row) : null;
    },

    async bindReceiptToJob(receiptId, jobId) {
      await db
        .update(schema.x402PaymentReceipts)
        .set({ jobId })
        .where(eq(schema.x402PaymentReceipts.id, receiptId));
    },
  };
}
