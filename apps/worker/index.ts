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
import { claimAndProcessJobs, reapExpiredJobs } from "@/modules/execution/worker";
import { deliverPendingWebhooks } from "@/modules/webhooks/webhook-service";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 5);
const REAP_EVERY_MS = Number(process.env.WORKER_REAP_INTERVAL_MS ?? 30_000);
// Must exceed the maximum permitted job runtime (600s) so live long jobs are
// not reaped while still executing on a healthy worker.
const MAX_RUN_MS = Number(process.env.WORKER_MAX_RUN_MS ?? 660_000);

let running = true;
let inFlight = false;
let lastReapMs = 0;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    // Multi-worker safe claim (SELECT ... FOR UPDATE SKIP LOCKED).
    const processed = await claimAndProcessJobs(undefined, BATCH_SIZE);
    if (processed > 0) logger.info("Worker processed jobs", { processed });

    // Deliver any pending webhooks (signed, retried).
    const delivered = await deliverPendingWebhooks();
    if (delivered > 0) logger.info("Worker delivered webhooks", { delivered });

    // Periodically reap jobs whose worker died mid-run.
    const now = Date.now();
    if (now - lastReapMs >= REAP_EVERY_MS) {
      lastReapMs = now;
      const reaped = await reapExpiredJobs(undefined, MAX_RUN_MS);
      if (reaped > 0) logger.warn("Worker reaped stuck jobs", { reaped });
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
