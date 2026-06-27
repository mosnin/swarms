/**
 * POST /api/v1/swarms/estimate
 *
 * Dry-run cost preview — returns the budget breakdown for a proposed swarm
 * without creating any jobs or reserving any funds. Callers use this to show
 * agents the price tag before asking them to commit.
 *
 * Returns:
 *   perWorkerMinor      — budget allocated per agent slot (workers + aggregator)
 *   agentSlots          — total agent count (tasks + 1 if aggregatorTask)
 *   estimatedCostMinor  — aggregate ceiling (perWorkerMinor * agentSlots)
 *   estimatedCostUsd    — same in dollars (display only, never used for math)
 *   maxGpuSecondsPerWorker
 *   rateMinorPerSecond  — current GPU rate
 *   currency
 *   withinBudget        — true when budgetMinor/budgetUsd covers the estimate
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { env } from "@/lib/env";
import { usdToMinor } from "@/lib/money";
import { idempotencyKeySchema } from "@/lib/idempotency";
import { authenticateRequest } from "@/modules/identity/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z
  .object({
    tasks: z.array(z.string().min(1).max(20_000)).min(1).max(16),
    aggregatorTask: z.string().min(1).max(20_000).optional(),
    budgetMinor: z.number().int().nonnegative().optional(),
    budgetUsd: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
  })
  .refine((d) => !(d.budgetUsd !== undefined && d.budgetMinor !== undefined), {
    message: "Provide budgetUsd or budgetMinor, not both",
    path: ["budgetUsd"],
  });

const DEFAULT_GPU_SECONDS = 60;
const MAX_WORKERS = 16;

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    await authenticateRequest(request);

    const json = await request.json().catch(() => null);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const { tasks, aggregatorTask, budgetUsd } = parsed.data;
    const currency = parsed.data.currency ?? (budgetUsd !== undefined ? "USD" : (env.GPU_RATE_CURRENCY ?? "USD"));
    const budgetMinor = parsed.data.budgetMinor ?? (budgetUsd !== undefined ? usdToMinor(budgetUsd) : undefined);
    const rate = env.GPU_RATE_MINOR_PER_SECOND ?? 2;

    if (tasks.length > MAX_WORKERS) {
      throw Errors.validation(`A swarm is capped at ${MAX_WORKERS} workers`, { requested: tasks.length });
    }

    const agentSlots = tasks.length + (aggregatorTask ? 1 : 0);

    let perWorkerMinor: number;
    let withinBudget: boolean;

    if (budgetMinor !== undefined && budgetMinor > 0) {
      perWorkerMinor = Math.floor(budgetMinor / agentSlots);
      withinBudget = perWorkerMinor >= rate;
    } else {
      perWorkerMinor = DEFAULT_GPU_SECONDS * rate;
      withinBudget = true;
    }

    const estimatedCostMinor = perWorkerMinor * agentSlots;
    const maxGpuSecondsPerWorker = rate > 0 ? Math.max(1, Math.floor(perWorkerMinor / rate)) : DEFAULT_GPU_SECONDS;

    // USD display conversion (display only — never used for internal math).
    const estimatedCostUsd = currency === "USD" ? estimatedCostMinor / 100 : null;

    return ok({
      agentSlots,
      workerCount: tasks.length,
      hasAggregator: aggregatorTask !== undefined,
      perWorkerMinor,
      estimatedCostMinor,
      estimatedCostUsd,
      maxGpuSecondsPerWorker,
      rateMinorPerSecond: rate,
      currency,
      withinBudget,
      ...(!withinBudget && {
        rejectionReason: `budgetMinor too low: need at least ${rate * agentSlots} minor units (${agentSlots} slots × ${rate} minor/sec minimum)`,
      }),
    });
  });
}
