/**
 * Platform-admin timeseries: daily job activity and spend across all tenants,
 * for the admin overview chart. Read-only; the calling route runs the admin
 * guard trio and audit-logs the read.
 */

import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

type Db = ReturnType<typeof getDb>;

export interface TimeseriesDay {
  date: string; // yyyy-mm-dd (UTC)
  jobs: number;
  succeeded: number;
  failed: number;
  spendMinor: number; // succeeded jobs only, integer minor units
}

const MIN_DAYS = 1;
const MAX_DAYS = 90;

export function clampTimeseriesDays(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return 14;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(requested)));
}

/**
 * One grouped query over `jobs` bucketed by UTC day; missing days are filled
 * with zero rows in JS so the series is always exactly `days` long and dense.
 */
export async function getPlatformTimeseries(
  params: { days?: number } = {},
  db: Db = getDb(),
): Promise<{ days: TimeseriesDay[] }> {
  const days = clampTimeseriesDays(params.days);
  const sinceMs = Date.now() - (days - 1) * 24 * 60 * 60 * 1000;
  const since = new Date(new Date(sinceMs).toISOString().slice(0, 10) + "T00:00:00.000Z");

  const rows = (await db.execute(sql`
    SELECT
      to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
      count(*)::int AS jobs,
      count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      coalesce(sum(cost_minor) FILTER (WHERE status = 'succeeded'), 0)::bigint AS spend_minor
    FROM jobs
    WHERE created_at >= ${since.toISOString()}
    GROUP BY 1
    ORDER BY 1
  `)) as unknown;

  const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
    date: string;
    jobs: number;
    succeeded: number;
    failed: number;
    spend_minor: number | string;
  }>;
  const byDate = new Map(list.map((r) => [r.date, r]));

  const out: TimeseriesDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const date = d.toISOString().slice(0, 10);
    const row = byDate.get(date);
    out.push({
      date,
      jobs: Number(row?.jobs ?? 0),
      succeeded: Number(row?.succeeded ?? 0),
      failed: Number(row?.failed ?? 0),
      spendMinor: Number(row?.spend_minor ?? 0),
    });
  }
  return { days: out };
}
