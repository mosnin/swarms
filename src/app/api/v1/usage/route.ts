/**
 * GET /api/v1/usage
 *
 * Cost dashboard — returns spend broken down by period (today, last 7 days,
 * last 30 days) and by category (swarm runs vs individual agent jobs).
 *
 * Query parameters:
 *   currency  — filter to a specific currency (default: all, shown as USD total
 *               when all entries share USD)
 *
 * Response:
 *   periods.today         — spend since midnight UTC
 *   periods.last7days     — spend in the rolling 7-day window
 *   periods.last30days    — spend in the rolling 30-day window
 *   breakdown.swarms      — total spent on swarm runs
 *   breakdown.jobs        — total spent on standalone agent jobs
 *   currency              — the currency of all amounts (or "MIXED" if multiple)
 *   totalJobs             — count of charged jobs
 *   totalSwarmRuns        — count of completed swarm runs
 */

import type { NextRequest } from "next/server";
import { and, eq, gte, isNotNull, sql, sum } from "drizzle-orm";

import { ok, route } from "@/lib/api";
import { formatResponse } from "@/lib/format-response";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requirePermission } from "@/modules/identity/access-control";
import { authenticateRequest } from "@/modules/identity/service";
import { computeBudgetAlerts } from "@/server/budget/budgetAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function startOfDayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysAgoUtc(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(request: NextRequest): Promise<Response> {
  return route(async () => {
    const db = getDb();
    const ctx = await authenticateRequest(request);
    requirePermission(ctx, "jobs.read");

    const today = startOfDayUtc();
    const sevenDaysAgo = daysAgoUtc(7);
    const thirtyDaysAgo = daysAgoUtc(30);

    const orgId = ctx.organizationId;

    // Base condition: debit charges for this org.
    const baseWhere = and(
      eq(schema.usageLedgerEntries.organizationId, orgId),
      eq(schema.usageLedgerEntries.kind, "charge"),
      eq(schema.usageLedgerEntries.direction, "debit"),
    );

    // Period totals.
    const [todayRow, week7Row, month30Row] = await Promise.all([
      db
        .select({ total: sum(schema.usageLedgerEntries.amountMinor) })
        .from(schema.usageLedgerEntries)
        .where(and(baseWhere, gte(schema.usageLedgerEntries.createdAt, today))),
      db
        .select({ total: sum(schema.usageLedgerEntries.amountMinor) })
        .from(schema.usageLedgerEntries)
        .where(and(baseWhere, gte(schema.usageLedgerEntries.createdAt, sevenDaysAgo))),
      db
        .select({ total: sum(schema.usageLedgerEntries.amountMinor) })
        .from(schema.usageLedgerEntries)
        .where(and(baseWhere, gte(schema.usageLedgerEntries.createdAt, thirtyDaysAgo))),
    ]);

    // Swarm vs standalone breakdown: join ledger → jobs → swarm_agents to determine
    // whether a job belongs to a swarm. A job is a "swarm job" when it has a
    // swarmAgent row pointing at it.
    const [swarmSpendRow, jobCount, swarmRunCount, budgetAlerts] = await Promise.all([
      db
        .select({ total: sum(schema.usageLedgerEntries.amountMinor) })
        .from(schema.usageLedgerEntries)
        .innerJoin(schema.swarmAgents, eq(schema.swarmAgents.jobId, schema.usageLedgerEntries.jobId))
        .where(and(baseWhere, isNotNull(schema.usageLedgerEntries.jobId))),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(schema.usageLedgerEntries)
        .where(and(baseWhere, isNotNull(schema.usageLedgerEntries.jobId))),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(schema.swarmRuns)
        .where(eq(schema.swarmRuns.organizationId, orgId)),
      computeBudgetAlerts(orgId, "USD", db),
    ]);

    const totalMinor = Number(month30Row[0]?.total ?? 0);
    const swarmMinor = Number(swarmSpendRow[0]?.total ?? 0);
    const standaloneMinor = totalMinor - swarmMinor;

    const usageData = {
      periods: {
        today: Number(todayRow[0]?.total ?? 0),
        last7days: Number(week7Row[0]?.total ?? 0),
        last30days: totalMinor,
      },
      breakdown: {
        swarms: swarmMinor,
        jobs: Math.max(0, standaloneMinor),
      },
      currency: "USD",
      totalJobs: jobCount[0]?.count ?? 0,
      totalSwarmRuns: swarmRunCount[0]?.count ?? 0,
      budgetAlerts,
    };
    if (new URL(request.url).searchParams.get("format") === "markdown") {
      return formatResponse(request, usageData);
    }
    return ok(usageData);
  });
}
