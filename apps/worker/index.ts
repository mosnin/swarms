/**
 * Swarms standalone worker.
 *
 * Runs as its OWN process — separate from the Next.js control plane. It polls
 * Postgres (the system of record) for queued jobs and processes them through the
 * shared execution core, writing worker runs, execution logs, usage charges, and
 * budget commit/release. It imports no web/dashboard/browser code.
 *
 * Local dev:   npm run worker
 * Production:  run this entrypoint as a separate deployment (see
 *              docs/DEPLOYMENT_TOPOLOGY.md), scaled independently of the web app.
 */

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  claimAndProcessJobs,
  pruneWebhookDeliveries,
  reapExpiredJobs,
  reapOrphanedEvaluations,
  reapOrphanedSimulationRuns,
  reapOrphanedSwarmRuns,
} from "@/modules/execution/worker";
import { deliverPendingWebhooks } from "@/modules/webhooks/webhook-service";
import { applyCompletedWakes, wakeDueAgents } from "@/modules/hosted-agents/agent-service";
import {
  chargeAgentStandby,
  resumeFundedAgents,
  suspendUnfundedAgents,
} from "@/modules/hosted-agents/billing-service";
import { runDueSchedules } from "@/modules/schedules/schedule-service";
import { reapExpiredArtifacts } from "@/modules/artifacts/artifact-service";
import { runDueAutoReloads } from "@/modules/billing/credit-service";
import { pgRateLimitCleanup } from "@/server/ratelimit/pgRateLimiter";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 5);
const REAP_EVERY_MS = Number(process.env.WORKER_REAP_INTERVAL_MS ?? 30_000);
// Must exceed the maximum permitted job runtime (600s) so live long jobs are
// not reaped while still executing on a healthy worker.
const MAX_RUN_MS = Number(process.env.WORKER_MAX_RUN_MS ?? 660_000);

let running = true;
let inFlight = false;
let lastReapMs = 0;

// A long-running poll loop must survive a single stray async failure. Node's
// default is to terminate the process on an unhandled rejection / uncaught
// exception — which for this worker turns a transient background DB connection
// error (e.g. a pooled connection dropped by the database) into a full crash and
// restart loop. Log and keep polling instead; the next tick reconnects. The
// message is preserved so the real cause is still visible in the logs.
process.on("unhandledRejection", (reason) => {
  logger.error("Worker unhandledRejection (kept alive)", {
    error: reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason),
  });
});
process.on("uncaughtException", (error) => {
  logger.error("Worker uncaughtException (kept alive)", {
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
});

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    // Multi-worker safe claim (SELECT ... FOR UPDATE SKIP LOCKED).
    const processed = await claimAndProcessJobs(undefined, BATCH_SIZE);
    if (processed > 0) logger.info("Worker processed jobs", { processed });

    // Fire any due schedules (cron for agents): enqueues agent/swarm/simulation
    // runs through the normal spine. Idempotent per firing; safe across replicas.
    const firedSchedules = await runDueSchedules();
    if (firedSchedules > 0) logger.info("Worker fired schedules", { firedSchedules });

    // Wake due hosted agents (message-driven + heartbeat) — each wake is a
    // normal charged job — and fold finished wake outputs back into memory.
    const woken = await wakeDueAgents().catch(() => 0);
    if (woken > 0) logger.info("Worker woke hosted agents", { woken });
    const wakesApplied = await applyCompletedWakes().catch(() => 0);
    if (wakesApplied > 0) logger.info("Worker applied hosted-agent wake outputs", { wakesApplied });

    // Deliver any pending webhooks (signed, retried).
    const delivered = await deliverPendingWebhooks();
    if (delivered > 0) logger.info("Worker delivered webhooks", { delivered });

    // Periodically reap jobs whose worker died mid-run.
    const now = Date.now();
    if (now - lastReapMs >= REAP_EVERY_MS) {
      lastReapMs = now;
      const reaped = await reapExpiredJobs(undefined, MAX_RUN_MS);
      if (reaped > 0) logger.warn("Worker reaped stuck jobs", { reaped });
      // Recover swarm runs orphaned by a dead director (settles them to failed
      // and releases outstanding worker holds).
      const runsReaped = await reapOrphanedSwarmRuns();
      if (runsReaped > 0) logger.warn("Worker reaped orphaned swarm runs", { runsReaped });
      // Same recovery for the other director-backed run types.
      const simsReaped = await reapOrphanedSimulationRuns().catch(() => 0);
      if (simsReaped > 0) logger.warn("Worker reaped orphaned simulation runs", { simsReaped });
      const evalsReaped = await reapOrphanedEvaluations().catch(() => 0);
      if (evalsReaped > 0) logger.warn("Worker reaped orphaned evaluations", { evalsReaped });
      // Evict closed rate-limit windows so the shared counter table doesn't bloat.
      const rlPurged = await pgRateLimitCleanup().catch(() => 0);
      if (rlPurged > 0) logger.info("Worker purged rate-limit rows", { rlPurged });
      // Delete artifacts past their retention window (bytes + metadata).
      const artifactsReaped = await reapExpiredArtifacts().catch(() => 0);
      if (artifactsReaped > 0) logger.info("Worker reaped expired artifacts", { artifactsReaped });
      // Top up orgs whose balance dropped below their auto-reload threshold.
      const reloaded = await runDueAutoReloads().catch(() => 0);
      if (reloaded > 0) logger.info("Worker ran auto-reloads", { reloaded });
      // Hosted-agent recurring billing: hourly standby ticks (exactly-once per
      // agent-hour), then enforce funding — suspend unfunded, resume topped-up.
      const standbyCharged = await chargeAgentStandby().catch(() => 0);
      if (standbyCharged > 0) logger.info("Worker charged agent standby", { standbyCharged });
      const agentsSuspended = await suspendUnfundedAgents().catch(() => 0);
      if (agentsSuspended > 0) logger.warn("Worker suspended unfunded agents", { agentsSuspended });
      const agentsResumed = await resumeFundedAgents().catch(() => 0);
      if (agentsResumed > 0) logger.info("Worker resumed funded agents", { agentsResumed });
      // Evict old terminal webhook deliveries so the queue table stays bounded.
      const whPruned = await pruneWebhookDeliveries().catch(() => 0);
      if (whPruned > 0) logger.info("Worker pruned webhook deliveries", { whPruned });
    }
  } catch (error) {
    // Never crash the loop on a single failure; log and continue.
    logger.error("Worker poll failed", { error });
  } finally {
    inFlight = false;
  }
}

async function main(): Promise<void> {
  logger.info("Swarms worker starting", {
    env: env.NODE_ENV,
    pollIntervalMs: POLL_INTERVAL_MS,
    batchSize: BATCH_SIZE,
  });

  const shutdown = (signal: string) => {
    logger.info("Worker shutting down", { signal });
    running = false;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (running) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Allow an in-flight batch to settle before exiting.
  while (inFlight) await new Promise((resolve) => setTimeout(resolve, 50));
  logger.info("Worker stopped cleanly");
  process.exit(0);
}

main().catch((error) => {
  logger.error("Worker crashed", { error });
  process.exit(1);
});
