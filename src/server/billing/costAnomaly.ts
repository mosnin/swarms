/**
 * Cost anomaly detection. After a job's charge commits, compare it to the org's
 * recent spending; a charge far above the trailing average (and above a floor)
 * is surfaced as a `cost.anomaly` webhook + audit event so a runaway or
 * mispriced run is caught fast. Pure detection is separated from the side
 * effects so it is exhaustively unit-testable.
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { writeAuditSystem } from "@/modules/governance/audit";
import { fanOutWebhook } from "@/modules/webhooks/webhook-service";
import type { JobRecord } from "@/modules/execution/job-service";

type Db = ReturnType<typeof getDb>;

/** Minimum trailing samples required before the average is meaningful. */
const MIN_SAMPLES = 3;

export interface AnomalyVerdict {
  isAnomaly: boolean;
  averageMinor: number;
  ratio: number;
  samples: number;
}

/**
 * Pure detector: is `costMinor` anomalous versus `recentCharges`? Anomalous when
 * there are enough samples, the charge clears the floor, and it exceeds
 * `factor`× the trailing average. A `factor` of 0 disables detection.
 */
export function detectCostAnomaly(
  costMinor: number,
  recentCharges: readonly number[],
  factor: number,
  minMinor: number,
): AnomalyVerdict {
  const samples = recentCharges.length;
  if (factor <= 0 || samples < MIN_SAMPLES || costMinor < minMinor) {
    return { isAnomaly: false, averageMinor: 0, ratio: 0, samples };
  }
  const averageMinor = recentCharges.reduce((a, b) => a + b, 0) / samples;
  if (averageMinor <= 0) return { isAnomaly: false, averageMinor: 0, ratio: 0, samples };
  const ratio = costMinor / averageMinor;
  return { isAnomaly: ratio >= factor, averageMinor: Math.round(averageMinor), ratio, samples };
}

/**
 * Check a just-charged job for a cost anomaly and, if found, emit a
 * `cost.anomaly` webhook + audit event. Best-effort — never throws into the
 * settle path.
 */
export async function checkCostAnomaly(job: JobRecord, costMinor: number, db: Db = getDb()): Promise<void> {
  const factor = env.COST_ANOMALY_FACTOR ?? 4;
  const minMinor = env.COST_ANOMALY_MIN_MINOR ?? 100;
  const window = env.COST_ANOMALY_WINDOW ?? 20;
  if (factor <= 0 || costMinor < minMinor) return;

  try {
    // Trailing charges for this org+currency, excluding this job's own charge.
    const rows = await db
      .select({ amountMinor: schema.usageLedgerEntries.amountMinor })
      .from(schema.usageLedgerEntries)
      .where(
        and(
          eq(schema.usageLedgerEntries.organizationId, job.organizationId),
          eq(schema.usageLedgerEntries.kind, "charge"),
          eq(schema.usageLedgerEntries.currency, job.costCurrency.toUpperCase()),
        ),
      )
      .orderBy(desc(schema.usageLedgerEntries.createdAt))
      .limit(window + 1);

    // Drop the most recent entry if it's this job's own charge (same amount).
    const recent = rows
      .map((r) => r.amountMinor)
      .filter((_, i) => !(i === 0 && rows[0]?.amountMinor === costMinor))
      .slice(0, window);

    const verdict = detectCostAnomaly(costMinor, recent, factor, minMinor);
    if (!verdict.isAnomaly) return;

    logger.warn("cost anomaly detected", {
      jobId: job.id,
      costMinor,
      averageMinor: verdict.averageMinor,
      ratio: Number(verdict.ratio.toFixed(2)),
    });
    await writeAuditSystem(
      job.organizationId,
      {
        action: "cost.anomaly",
        resourceType: "job",
        resourceId: job.id,
        after: {
          costMinor,
          averageMinor: verdict.averageMinor,
          ratio: Number(verdict.ratio.toFixed(2)),
          capabilityKind: job.capabilityKind,
        },
      },
      db,
    );
    await fanOutWebhook(
      {
        organizationId: job.organizationId,
        jobId: job.id,
        eventType: "cost.anomaly",
        data: {
          jobId: job.id,
          capabilityKind: job.capabilityKind,
          costMinor,
          currency: job.costCurrency,
          averageMinor: verdict.averageMinor,
          ratio: Number(verdict.ratio.toFixed(2)),
        },
      },
      db,
    );
  } catch (error) {
    logger.error("cost anomaly check failed", { jobId: job.id, error: error instanceof Error ? error.message : String(error) });
  }
}
