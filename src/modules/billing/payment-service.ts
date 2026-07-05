/**
 * x402 payment binding + settlement core. Storage- and provider-agnostic so the
 * security-critical rules can be unit-tested exhaustively:
 *
 * 1. A payment is bound to the exact (org, skill version, idempotency key,
 *    price, currency) tuple via {@link bindingDigest}.
 * 2. Settling the same idempotency key again returns the existing receipt
 *    (idempotent — no double charge).
 * 3. A settlement reference (txRef) can fund at most one binding (no reuse for a
 *    different job).
 * 4. A proof must verify against the challenge for the requested binding.
 */

import { createHash } from "node:crypto";

import { Errors } from "@/lib/errors";
import { newId, IdPrefix } from "@/lib/ids";
import { systemClock, type Clock } from "@/lib/time";
import { appendEntry, type LedgerStore } from "@/modules/billing/ledger-service";
import type {
  PaymentBinding,
  PaymentProof,
  PaymentProvider,
  PaymentRequirements,
} from "@/server/payments/types";

/** Deterministic, order-independent digest of a payment binding. */
export function bindingDigest(binding: PaymentBinding): string {
  const canonical = JSON.stringify({
    amountMinor: binding.amountMinor,
    currency: binding.currency.toUpperCase(),
    idempotencyKey: binding.idempotencyKey,
    organizationId: binding.organizationId,
    skillVersionId: binding.skillVersionId,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface PaymentAttemptRecord {
  id: string;
  organizationId: string;
  jobId: string | null;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  scheme: string;
  nonce: string;
  binding: string;
  status: "pending" | "settled" | "failed" | "expired";
  challenge: unknown;
  proof: unknown;
  providerRef: string | null;
  createdAt: Date;
}

export interface PaymentReceiptRecord {
  id: string;
  organizationId: string;
  jobId: string | null;
  paymentAttemptId: string;
  amountMinor: number;
  currency: string;
  txRef: string;
  binding: string;
  providerRef: string | null;
  createdAt: Date;
}

export interface PaymentStore {
  insertAttempt(record: PaymentAttemptRecord): Promise<PaymentAttemptRecord>;
  insertReceipt(record: PaymentReceiptRecord): Promise<PaymentReceiptRecord>;
  findReceiptByBinding(organizationId: string, binding: string): Promise<PaymentReceiptRecord | null>;
  findReceiptByTxRef(organizationId: string, txRef: string): Promise<PaymentReceiptRecord | null>;
  bindReceiptToJob(receiptId: string, jobId: string): Promise<void>;
}

/** Build a 402 challenge for a binding and persist the pending attempt. */
export async function issueChallenge(
  store: PaymentStore,
  provider: PaymentProvider,
  binding: PaymentBinding,
  clock: Clock = systemClock,
): Promise<PaymentRequirements> {
  const digest = bindingDigest(binding);
  const nonce = newId(IdPrefix.paymentAttempt);
  const requirements = provider.challenge(binding, nonce, digest);

  await store.insertAttempt({
    id: newId(IdPrefix.paymentAttempt),
    organizationId: binding.organizationId,
    jobId: null,
    idempotencyKey: binding.idempotencyKey,
    amountMinor: binding.amountMinor,
    currency: binding.currency,
    scheme: requirements.scheme,
    nonce,
    binding: digest,
    status: "pending",
    challenge: requirements,
    proof: null,
    providerRef: null,
    createdAt: clock.now(),
  });

  return requirements;
}

export interface SettleResult {
  receipt: PaymentReceiptRecord;
  /** True when an already-settled payment for this binding was returned. */
  replay: boolean;
}

/**
 * Verify and settle a presented proof for a binding. Enforces idempotent replay
 * and txRef single-use. Throws typed errors on every failure path.
 */
export async function settlePayment(
  store: PaymentStore,
  provider: PaymentProvider,
  ledger: LedgerStore,
  binding: PaymentBinding,
  proof: PaymentProof,
  clock: Clock = systemClock,
): Promise<SettleResult> {
  const digest = bindingDigest(binding);

  // (2) Idempotent replay: this exact request was already paid. No new ledger
  // entry — the credit was appended when the receipt was first created.
  const existingForBinding = await store.findReceiptByBinding(binding.organizationId, digest);
  if (existingForBinding) {
    return { receipt: existingForBinding, replay: true };
  }

  // (4) The proof must be bound to THIS request.
  if (proof.binding !== digest) {
    throw Errors.paymentRequired("Payment is not bound to this request", { reason: "binding_mismatch" });
  }

  // (3) A settlement reference can fund at most one binding.
  const existingForTx = await store.findReceiptByTxRef(binding.organizationId, proof.txRef);
  if (existingForTx) {
    throw Errors.conflict("Payment settlement reference has already been used", {
      reason: "txref_reused",
    });
  }

  // Reconstruct the challenge for verification (amount/nonce/binding bound).
  const requirements = provider.challenge(binding, proof.nonce, digest);
  const verification = await provider.verify(proof, requirements);
  if (!verification.ok) {
    throw Errors.paymentRequired("Payment verification failed", { reason: verification.reason });
  }

  const now = clock.now();
  const attempt = await store.insertAttempt({
    id: newId(IdPrefix.paymentAttempt),
    organizationId: binding.organizationId,
    jobId: null,
    idempotencyKey: binding.idempotencyKey,
    amountMinor: binding.amountMinor,
    currency: binding.currency,
    scheme: proof.scheme,
    nonce: proof.nonce,
    binding: digest,
    status: "settled",
    challenge: requirements,
    proof,
    providerRef: verification.providerRef ?? null,
    createdAt: now,
  });

  const receipt = await store.insertReceipt({
    id: newId(IdPrefix.paymentReceipt),
    organizationId: binding.organizationId,
    jobId: null,
    paymentAttemptId: attempt.id,
    amountMinor: binding.amountMinor,
    currency: binding.currency,
    txRef: verification.txRef,
    binding: digest,
    providerRef: verification.providerRef ?? null,
    createdAt: now,
  });

  // Record inbound funds in the append-only ledger so balances reflect money
  // paid IN (not just charges out) and reconciliation finds a matching credit
  // for every receipt. Written once per new receipt (replays return early above).
  await appendEntry(
    ledger,
    {
      organizationId: binding.organizationId,
      direction: "credit",
      kind: "payment",
      amountMinor: binding.amountMinor,
      currency: binding.currency,
      description: "x402 payment settlement",
      refType: "payment_receipt",
      refId: receipt.id,
    },
    clock,
  );

  return { receipt, replay: false };
}

/** Decode the base64 JSON `X-PAYMENT` header into a proof, or `null`. */
export function decodePaymentHeader(raw: string | null): PaymentProof | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Partial<PaymentProof>;
    if (
      typeof json.scheme === "string" &&
      typeof json.nonce === "string" &&
      typeof json.binding === "string" &&
      typeof json.txRef === "string"
    ) {
      return { scheme: json.scheme, nonce: json.nonce, binding: json.binding, txRef: json.txRef };
    }
    return null;
  } catch {
    return null;
  }
}
