/**
 * Marketplace economics. When an organization pays to execute another org's
 * skill, the gross payment is split deterministically into a platform fee and a
 * creator earning, each recorded as a SEPARATE append-only ledger entry on the
 * creator's ledger. Refunds/reversals are separate compensating entries — never
 * destructive edits. Money is integer minor units only.
 */

import { applyBasisPoints, money, subtract } from "@/lib/money";
import { getDb } from "@/lib/db";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";

type Db = ReturnType<typeof getDb>;

export interface RevenueSplit {
  grossMinor: number;
  platformFeeMinor: number;
  creatorEarningMinor: number;
}

/** Deterministic split of a gross amount into platform fee + creator earning. */
export function splitRevenue(grossMinor: number, feeBps: number): RevenueSplit {
  const gross = money(grossMinor, "USD");
  const fee = applyBasisPoints(gross, feeBps, "half_up");
  const creator = subtract(gross, fee);
  return {
    grossMinor,
    platformFeeMinor: fee.amountMinor,
    creatorEarningMinor: creator.amountMinor,
  };
}

export interface RecordRevenueInput {
  creatorOrganizationId: string;
  /** The org that paid/executed (revenue is skipped when it equals the creator). */
  executingOrganizationId: string;
  jobId: string;
  skillVersionId: string;
  grossMinor: number;
  currency: string;
  feeBps: number;
}

/**
 * Record marketplace revenue for a paid execution: a gross credit and a separate
 * platform-fee debit on the creator's ledger (net = creator earning). No-op when
 * the executing org is the creator (internal use) or the amount is zero.
 */
export async function recordSkillRevenue(
  input: RecordRevenueInput,
  db: Db = getDb(),
): Promise<RevenueSplit | null> {
  if (input.grossMinor <= 0) return null;
  if (input.creatorOrganizationId === input.executingOrganizationId) return null;

  const split = splitRevenue(input.grossMinor, input.feeBps);
  const store = dbLedgerStore(db);

  await appendEntry(store, {
    organizationId: input.creatorOrganizationId,
    jobId: input.jobId,
    direction: "credit",
    kind: "credit",
    amountMinor: split.grossMinor,
    currency: input.currency,
    description: "Skill revenue (gross)",
    refType: "skill_version",
    refId: input.skillVersionId,
  });

  if (split.platformFeeMinor > 0) {
    await appendEntry(store, {
      organizationId: input.creatorOrganizationId,
      jobId: input.jobId,
      direction: "debit",
      kind: "adjustment",
      amountMinor: split.platformFeeMinor,
      currency: input.currency,
      description: "Platform fee",
      refType: "platform_fee",
      refId: input.skillVersionId,
    });
  }

  return split;
}
