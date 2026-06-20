/**
 * Marketplace read helpers: public skill discovery and a creator revenue summary
 * derived from the append-only ledger.
 */

import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";

type Db = ReturnType<typeof getDb>;

export async function listMarketplaceSkills(ctx: AuthContext, db: Db = getDb()) {
  requirePermission(ctx, "skills.read");
  return db
    .select({
      id: schema.skills.id,
      slug: schema.skills.slug,
      name: schema.skills.name,
      description: schema.skills.description,
      riskLevel: schema.skills.riskLevel,
      defaultPriceMinor: schema.skills.defaultPriceMinor,
      priceCurrency: schema.skills.priceCurrency,
      organizationId: schema.skills.organizationId,
    })
    .from(schema.skills)
    .where(eq(schema.skills.visibility, "public"))
    .orderBy(desc(schema.skills.createdAt))
    .limit(100);
}

export interface CreatorRevenueSummary {
  grossMinor: number;
  platformFeeMinor: number;
  netMinor: number;
  currency: string;
  entries: Array<{
    id: string;
    kind: string;
    direction: string;
    amountMinor: number;
    currency: string;
    refType: string | null;
    createdAt: Date;
  }>;
}

/**
 * Summarize the caller org's creator revenue from the ledger: gross credits for
 * skill revenue minus separately-recorded platform fees.
 */
export async function creatorRevenueSummary(
  ctx: AuthContext,
  db: Db = getDb(),
): Promise<CreatorRevenueSummary> {
  requirePermission(ctx, "billing.read");
  const rows = await db
    .select()
    .from(schema.usageLedgerEntries)
    .where(
      and(
        eq(schema.usageLedgerEntries.organizationId, ctx.organizationId),
        inArray(schema.usageLedgerEntries.refType, ["skill_version", "platform_fee"]),
      ),
    )
    .orderBy(desc(schema.usageLedgerEntries.createdAt))
    .limit(200);

  let grossMinor = 0;
  let platformFeeMinor = 0;
  for (const r of rows) {
    if (r.refType === "skill_version" && r.direction === "credit") grossMinor += r.amountMinor;
    if (r.refType === "platform_fee") platformFeeMinor += r.amountMinor;
  }

  return {
    grossMinor,
    platformFeeMinor,
    netMinor: grossMinor - platformFeeMinor,
    currency: rows[0]?.currency ?? "USD",
    entries: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      direction: r.direction,
      amountMinor: r.amountMinor,
      currency: r.currency,
      refType: r.refType,
      createdAt: r.createdAt,
    })),
  };
}
