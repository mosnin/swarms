/**
 * Credits, balance, spend analytics, and auto-reload.
 *
 * Money stays integer minor units in the append-only ledger. A prepaid credit
 * is a `credit`-kind ledger entry (direction credit); balance is
 * `sum(credits) - sum(debits)` — payments/credits/refunds in, charges/holds out,
 * releases back. Auto-reload watches that balance and, when it dips below the
 * threshold, captures a top-up via the provider port and appends the credit —
 * serialized by a row lock so concurrent workers never double-charge.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { Errors } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit, writeAuditSystem } from "@/modules/governance/audit";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";
import { fanOutWebhook } from "@/modules/webhooks/webhook-service";
import { getTopUpProvider } from "@/server/billing/topupProvider";
import { systemClock, type Clock } from "@/lib/time";

type Db = ReturnType<typeof getDb>;

/** Available balance (minor units) for an org+currency: credits − debits. */
export async function balanceForOrg(
  organizationId: string,
  currency: string,
  db: Db = getDb(),
): Promise<number> {
  const rows = await db
    .select({
      net: sql<string>`coalesce(sum(case when ${schema.usageLedgerEntries.direction} = 'credit' then ${schema.usageLedgerEntries.amountMinor} else -${schema.usageLedgerEntries.amountMinor} end), 0)`,
    })
    .from(schema.usageLedgerEntries)
    .where(
      and(
        eq(schema.usageLedgerEntries.organizationId, organizationId),
        eq(schema.usageLedgerEntries.currency, currency.toUpperCase()),
      ),
    );
  return Number(rows[0]?.net ?? 0);
}

export interface BalanceView {
  currency: string;
  balanceMinor: number;
}

/** Balances across every currency the org has ledger activity in. */
export async function getBalances(ctx: AuthContext, db: Db = getDb()): Promise<BalanceView[]> {
  requirePermission(ctx, "billing.read");
  const rows = await db
    .select({
      currency: schema.usageLedgerEntries.currency,
      net: sql<string>`coalesce(sum(case when ${schema.usageLedgerEntries.direction} = 'credit' then ${schema.usageLedgerEntries.amountMinor} else -${schema.usageLedgerEntries.amountMinor} end), 0)`,
    })
    .from(schema.usageLedgerEntries)
    .where(eq(schema.usageLedgerEntries.organizationId, ctx.organizationId))
    .groupBy(schema.usageLedgerEntries.currency);
  return rows.map((r) => ({ currency: r.currency, balanceMinor: Number(r.net) }));
}

/** Grant prepaid/promotional credit (billing.manage). Appends a credit entry. */
export async function grantCredit(
  ctx: AuthContext,
  input: { amountMinor: number; currency?: string; reason?: string; refId?: string | null },
  db: Db = getDb(),
): Promise<{ balanceMinor: number; currency: string }> {
  requirePermission(ctx, "billing.manage");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw Errors.validation("amountMinor must be a positive integer (minor units)");
  }
  const currency = (input.currency ?? "USD").toUpperCase();
  await appendEntry(dbLedgerStore(db), {
    organizationId: ctx.organizationId,
    direction: "credit",
    kind: "credit",
    amountMinor: input.amountMinor,
    currency,
    description: input.reason ?? "Prepaid credit grant",
    refType: "credit_grant",
    refId: input.refId ?? null,
  });
  await writeAudit(
    ctx,
    { action: "billing.credit_granted", resourceType: "organization", resourceId: ctx.organizationId, after: { amountMinor: input.amountMinor, currency } },
    db,
  );
  return { balanceMinor: await balanceForOrg(ctx.organizationId, currency, db), currency };
}

export interface UsageAnalytics {
  currency: string;
  sinceDays: number;
  totalSpentMinor: number;
  dailyBurnMinor: number;
  balanceMinor: number;
  /** Whole days of runway at the current burn rate, or null if burn is 0. */
  runwayDays: number | null;
  byDay: Array<{ date: string; spentMinor: number; runs: number }>;
}

/** Spend analytics from the ledger: charges over a window, burn rate, runway. */
export async function getUsageAnalytics(
  ctx: AuthContext,
  opts: { sinceDays?: number; currency?: string } = {},
  db: Db = getDb(),
  clock: Clock = systemClock,
): Promise<UsageAnalytics> {
  requirePermission(ctx, "billing.read");
  const sinceDays = Math.min(Math.max(opts.sinceDays ?? 30, 1), 365);
  const currency = (opts.currency ?? "USD").toUpperCase();
  const since = new Date(clock.now().getTime() - sinceDays * 86_400_000);

  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${schema.usageLedgerEntries.createdAt}), 'YYYY-MM-DD')`,
      spent: sql<string>`coalesce(sum(${schema.usageLedgerEntries.amountMinor}), 0)`,
      runs: sql<string>`count(*)`,
    })
    .from(schema.usageLedgerEntries)
    .where(
      and(
        eq(schema.usageLedgerEntries.organizationId, ctx.organizationId),
        eq(schema.usageLedgerEntries.currency, currency),
        eq(schema.usageLedgerEntries.kind, "charge"),
        gte(schema.usageLedgerEntries.createdAt, since),
      ),
    )
    .groupBy(sql`date_trunc('day', ${schema.usageLedgerEntries.createdAt})`)
    .orderBy(sql`date_trunc('day', ${schema.usageLedgerEntries.createdAt})`);

  const byDay = rows.map((r) => ({ date: r.day, spentMinor: Number(r.spent), runs: Number(r.runs) }));
  const totalSpentMinor = byDay.reduce((a, d) => a + d.spentMinor, 0);
  const dailyBurnMinor = Math.round(totalSpentMinor / sinceDays);
  const balanceMinor = await balanceForOrg(ctx.organizationId, currency, db);
  const runwayDays = dailyBurnMinor > 0 ? Math.floor(balanceMinor / dailyBurnMinor) : null;

  return { currency, sinceDays, totalSpentMinor, dailyBurnMinor, balanceMinor, runwayDays, byDay };
}

// ── Auto-reload ───────────────────────────────────────────────────────────────

export interface AutoReloadView {
  enabled: boolean;
  thresholdMinor: number;
  amountMinor: number;
  currency: string;
  minIntervalSeconds: number;
  lastReloadAt: string | null;
  lastError: string | null;
}

function toAutoReloadView(row: typeof schema.autoReloadConfigs.$inferSelect): AutoReloadView {
  return {
    enabled: row.enabled,
    thresholdMinor: row.thresholdMinor,
    amountMinor: row.amountMinor,
    currency: row.currency,
    minIntervalSeconds: row.minIntervalSeconds,
    lastReloadAt: row.lastReloadAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

export async function getAutoReload(ctx: AuthContext, db: Db = getDb()): Promise<AutoReloadView | null> {
  requirePermission(ctx, "billing.read");
  const row = (
    await db
      .select()
      .from(schema.autoReloadConfigs)
      .where(eq(schema.autoReloadConfigs.organizationId, ctx.organizationId))
      .limit(1)
  )[0];
  return row ? toAutoReloadView(row) : null;
}

/** Create or update the org's auto-reload rule (billing.manage). */
export async function setAutoReload(
  ctx: AuthContext,
  input: {
    enabled: boolean;
    thresholdMinor: number;
    amountMinor: number;
    currency?: string;
    minIntervalSeconds?: number;
  },
  db: Db = getDb(),
): Promise<AutoReloadView> {
  requirePermission(ctx, "billing.manage");
  if (!Number.isInteger(input.thresholdMinor) || input.thresholdMinor < 0) {
    throw Errors.validation("thresholdMinor must be a non-negative integer");
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw Errors.validation("amountMinor must be a positive integer");
  }
  const currency = (input.currency ?? "USD").toUpperCase();
  const minIntervalSeconds = Math.max(input.minIntervalSeconds ?? 3600, 60);

  const row = (
    await db
      .insert(schema.autoReloadConfigs)
      .values({
        organizationId: ctx.organizationId,
        enabled: input.enabled,
        thresholdMinor: input.thresholdMinor,
        amountMinor: input.amountMinor,
        currency,
        minIntervalSeconds,
      })
      .onConflictDoUpdate({
        target: schema.autoReloadConfigs.organizationId,
        set: {
          enabled: input.enabled,
          thresholdMinor: input.thresholdMinor,
          amountMinor: input.amountMinor,
          currency,
          minIntervalSeconds,
        },
      })
      .returning()
  )[0];
  if (!row) throw Errors.internal("Failed to save auto-reload config");
  await writeAudit(ctx, { action: "billing.auto_reload_set", resourceType: "organization", resourceId: ctx.organizationId, after: { enabled: input.enabled } }, db);
  return toAutoReloadView(row);
}

/**
 * Reload one org if its balance is below threshold and the min interval has
 * elapsed. Serialized by a FOR UPDATE lock on the config row so two workers can
 * never both capture. Returns true if a reload was performed.
 */
async function reloadOrgIfDue(
  configId: string,
  db: Db,
  clock: Clock,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const cfg = (
      await tx
        .select()
        .from(schema.autoReloadConfigs)
        .where(eq(schema.autoReloadConfigs.id, configId))
        .for("update")
        .limit(1)
    )[0];
    if (!cfg || !cfg.enabled) return false;

    const now = clock.now();
    if (cfg.lastReloadAt && now.getTime() - cfg.lastReloadAt.getTime() < cfg.minIntervalSeconds * 1000) {
      return false; // rate-limited
    }
    const balance = await balanceForOrg(cfg.organizationId, cfg.currency, tx as Db);
    if (balance >= cfg.thresholdMinor) return false; // not low

    // Deterministic idempotency key for this reload window, so a provider replay
    // captures at most once.
    const idempotencyKey = `autoreload-${cfg.id}-${now.toISOString()}`;
    const result = await getTopUpProvider().capture({
      organizationId: cfg.organizationId,
      amountMinor: cfg.amountMinor,
      currency: cfg.currency,
      idempotencyKey,
    });

    if (!result.ok) {
      await tx
        .update(schema.autoReloadConfigs)
        .set({ lastError: result.reason.slice(0, 1_000) })
        .where(eq(schema.autoReloadConfigs.id, cfg.id));
      return false;
    }

    // Capture succeeded — credit the ledger and stamp the reload.
    await appendEntry(
      dbLedgerStore(tx as Db),
      {
        organizationId: cfg.organizationId,
        direction: "credit",
        kind: "credit",
        amountMinor: cfg.amountMinor,
        currency: cfg.currency,
        description: "Auto-reload top-up",
        refType: "auto_reload",
        refId: result.providerRef,
      },
      clock,
    );
    await tx
      .update(schema.autoReloadConfigs)
      .set({ lastReloadAt: now, lastError: null })
      .where(eq(schema.autoReloadConfigs.id, cfg.id));
    await writeAuditSystem(cfg.organizationId, {
      action: "billing.auto_reloaded",
      resourceType: "organization",
      resourceId: cfg.organizationId,
      after: { amountMinor: cfg.amountMinor, currency: cfg.currency, providerRef: result.providerRef },
    }, tx as Db);
    return true;
  });
}

/**
 * Worker entrypoint: run auto-reload for every enabled org that is due. Called
 * on the worker tick. Returns the number of orgs reloaded.
 */
export async function runDueAutoReloads(db: Db = getDb(), clock: Clock = systemClock): Promise<number> {
  const enabled = await db
    .select({ id: schema.autoReloadConfigs.id, organizationId: schema.autoReloadConfigs.organizationId, currency: schema.autoReloadConfigs.currency, amountMinor: schema.autoReloadConfigs.amountMinor })
    .from(schema.autoReloadConfigs)
    .where(eq(schema.autoReloadConfigs.enabled, true))
    .orderBy(desc(schema.autoReloadConfigs.createdAt));

  let reloaded = 0;
  for (const cfg of enabled) {
    try {
      const did = await reloadOrgIfDue(cfg.id, db, clock);
      if (did) {
        reloaded += 1;
        // Notify org endpoints that a top-up happened (best-effort).
        fanOutWebhook(
          {
            organizationId: cfg.organizationId,
            eventType: "billing.auto_reloaded",
            data: { amountMinor: cfg.amountMinor, currency: cfg.currency },
          },
          db,
        ).catch(() => undefined);
      }
    } catch (error) {
      logger.error("auto-reload failed", { configId: cfg.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return reloaded;
}
