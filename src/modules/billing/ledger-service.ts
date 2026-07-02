/**
 * Usage ledger service. The ledger is **append-only**: entries are never
 * updated or deleted. Corrections are made by appending a compensating
 * (reversing) entry. The {@link LedgerStore} port deliberately exposes only
 * insert + read operations — there is no update/delete path by construction.
 */

import { Errors } from "@/lib/errors";
import { newId, IdPrefix } from "@/lib/ids";
import { systemClock, type Clock } from "@/lib/time";

export type LedgerDirection = "debit" | "credit";
export type LedgerEntryKind =
  | "charge"
  | "credit"
  | "refund"
  | "payment"
  | "adjustment"
  | "hold"
  | "release";

export interface LedgerEntryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly walletId: string | null;
  readonly jobId: string | null;
  readonly direction: LedgerDirection;
  readonly kind: LedgerEntryKind;
  /** Integer minor units only — never a floating-point value. */
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string | null;
  readonly refType: string | null;
  readonly refId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AppendLedgerEntryInput {
  organizationId: string;
  walletId?: string | null;
  jobId?: string | null;
  direction: LedgerDirection;
  kind: LedgerEntryKind;
  amountMinor: number;
  currency: string;
  description?: string | null;
  refType?: string | null;
  refId?: string | null;
}

/** Insert-and-read-only port. The absence of update/delete is intentional. */
export interface LedgerStore {
  insert(record: LedgerEntryRecord): Promise<LedgerEntryRecord>;
  findById(id: string): Promise<LedgerEntryRecord | null>;
  listByOrganization(organizationId: string): Promise<LedgerEntryRecord[]>;
}

function assertValidAmount(amountMinor: number): void {
  if (!Number.isInteger(amountMinor) || !Number.isSafeInteger(amountMinor)) {
    throw Errors.validation("amountMinor must be an integer number of minor units", {
      amountMinor,
    });
  }
  if (amountMinor <= 0) {
    // Direction encodes sign; amounts are always positive magnitudes.
    throw Errors.validation("amountMinor must be a positive magnitude; use direction for sign");
  }
}

/** Append a new, frozen ledger entry. */
export async function appendEntry(
  store: LedgerStore,
  input: AppendLedgerEntryInput,
  clock: Clock = systemClock,
): Promise<LedgerEntryRecord> {
  assertValidAmount(input.amountMinor);
  const now = clock.now();
  const record: LedgerEntryRecord = Object.freeze({
    id: newId(IdPrefix.ledgerEntry),
    organizationId: input.organizationId,
    walletId: input.walletId ?? null,
    jobId: input.jobId ?? null,
    direction: input.direction,
    kind: input.kind,
    amountMinor: input.amountMinor,
    currency: input.currency,
    description: input.description ?? null,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return store.insert(record);
}

/**
 * Reverse an existing entry by appending a compensating entry of the opposite
 * direction. The original entry is left untouched (append-only).
 */
export async function reverseEntry(
  store: LedgerStore,
  entryId: string,
  reason: string,
  clock: Clock = systemClock,
): Promise<LedgerEntryRecord> {
  const original = await store.findById(entryId);
  if (!original) throw Errors.notFound(`Ledger entry ${entryId} not found`);
  return appendEntry(
    store,
    {
      organizationId: original.organizationId,
      walletId: original.walletId,
      jobId: original.jobId,
      direction: original.direction === "debit" ? "credit" : "debit",
      kind: "adjustment",
      amountMinor: original.amountMinor,
      currency: original.currency,
      description: `Reversal of ${entryId}: ${reason}`,
      refType: "ledger_entry",
      refId: entryId,
    },
    clock,
  );
}

/** Net balance in minor units (credits positive, debits negative). */
export function computeBalanceMinor(entries: readonly LedgerEntryRecord[]): number {
  return entries.reduce(
    (acc, entry) => acc + (entry.direction === "credit" ? entry.amountMinor : -entry.amountMinor),
    0,
  );
}
