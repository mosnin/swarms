/**
 * Postgres-backed {@link PaymentStore} plus the paid-execution orchestration for
 * `POST /api/v1/execute-paid`. Composes payment binding/settlement with the same
 * idempotent job core used by free execution, so a paid job is created exactly
 * once and the receipt is bound to it.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";
import {
  issueChallenge,
  settlePayment,
  type PaymentAttemptRecord,
  type PaymentReceiptRecord,
  type PaymentStore,
} from "@/modules/billing/payment-service";
import {
  requirePermission,
  type AuthContext,
} from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { createJob as createJobCore } from "@/modules/execution/job-service";
import {
  dbJobStore,
  resolveSkillVersion,
  type ExecuteResponse,
} from "@/modules/execution/job-repository";
import { getPaymentProvider } from "@/server/payments/config";
import { getJobQueue } from "@/server/queue/queue";
import type { PaymentProof, PaymentRequirements } from "@/server/payments/types";

type Db = ReturnType<typeof getDb>;
type ReceiptRow = typeof schema.x402PaymentReceipts.$inferSelect;

function toReceipt(row: ReceiptRow): PaymentReceiptRecord {
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
    async insertAttempt(record: PaymentAttemptRecord) {
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
          })
          .returning()
      )[0];
      if (!row) throw Errors.internal("Failed to insert payment attempt");
      return { ...record, id: row.id };
    },
    async insertReceipt(record: PaymentReceiptRecord) {
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
          })
          .returning()
      )[0];
      if (!row) throw Errors.internal("Failed to insert payment receipt");
      return toReceipt(row);
    },
    async findReceiptByBinding(organizationId, binding) {
      if (!binding) return null;
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

export interface ExecutePaidRequest {
  skillSlug: string;
  skillVersion?: string;
  input: unknown;
  idempotencyKey: string;
  currency?: string;
}

export type ExecutePaidResult =
  | { kind: "payment_required"; requirements: PaymentRequirements }
  | { kind: "ok"; response: ExecuteResponse };

/**
 * Paid execution. With no/invalid proof, returns x402 payment requirements
 * (caller should respond 402). With a valid proof, settles the payment, binds
 * the receipt to an idempotently-created job, and enqueues it.
 */
export async function executePaidSkill(
  ctx: AuthContext,
  request: ExecutePaidRequest,
  proof: PaymentProof | null,
  db: Db = getDb(),
): Promise<ExecutePaidResult> {
  requirePermission(ctx, "jobs.create");

  const resolved = await resolveSkillVersion(ctx, request.skillSlug, request.skillVersion, db);
  const currency = request.currency ?? resolved.priceCurrency;
  const binding = {
    organizationId: ctx.organizationId,
    skillVersionId: resolved.id,
    idempotencyKey: request.idempotencyKey,
    amountMinor: resolved.priceMinor,
    currency,
  };

  const provider = getPaymentProvider();
  const store = dbPaymentStore(db);

  // No proof presented → advertise payment requirements.
  if (!proof) {
    const requirements = await issueChallenge(store, provider, binding);
    await writeAudit(ctx, {
      action: "payment.required",
      resourceType: "skill_version",
      resourceId: resolved.id,
      after: { amountMinor: binding.amountMinor, currency },
    });
    return { kind: "payment_required", requirements };
  }

  // Verify + settle (idempotent, replay/duplicate protected).
  const { receipt, replay } = await settlePayment(store, provider, binding, proof);
  if (!replay) {
    await writeAudit(ctx, {
      action: "payment.verified",
      resourceType: "payment_receipt",
      resourceId: receipt.id,
      after: { amountMinor: receipt.amountMinor, currency, txRef: receipt.txRef },
    });
  }

  // Create the job (idempotent on the same key) and bind the receipt to it.
  const { job, replay: jobReplay } = await createJobCore(dbJobStore(db), getJobQueue(), {
    organizationId: ctx.organizationId,
    createdByUserId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
    apiKeyId: ctx.actor.kind === "agent" ? ctx.actor.apiKeyId : null,
    skillVersion: resolved,
    input: request.input,
    idempotencyKey: request.idempotencyKey,
    currency,
  });

  if (receipt.jobId !== job.id) {
    await store.bindReceiptToJob(receipt.id, job.id);
  }

  if (!jobReplay) {
    // Record the payment as a funding credit bound to the job (append-only).
    await appendEntry(dbLedgerStore(db), {
      organizationId: ctx.organizationId,
      jobId: job.id,
      direction: "credit",
      kind: "payment",
      amountMinor: receipt.amountMinor,
      currency,
      description: "x402 payment for job execution",
      refType: "payment_receipt",
      refId: receipt.id,
    });
    await writeAudit(ctx, {
      action: "job.created",
      resourceType: "job",
      resourceId: job.id,
      after: { skillSlug: request.skillSlug, paid: true },
    });
  }

  return {
    kind: "ok",
    response: {
      jobId: job.id,
      status: job.status,
      paymentRequired: false,
      estimatedCostMinor: resolved.priceMinor,
      currency,
      executionUrl: `/api/v1/jobs/${job.id}`,
      createdAt: job.createdAt.toISOString(),
    },
  };
}
