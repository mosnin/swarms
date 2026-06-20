/**
 * Hermes Cloud standalone worker.
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
import { pollQueuedJobs } from "@/modules/execution/worker";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 5);

let running = true;
let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const processed = await pollQueuedJobs(undefined, BATCH_SIZE);
    if (processed > 0) logger.info("Worker processed jobs", { processed });
  } catch (error) {
    // Never crash the loop on a single failure; log and continue.
    logger.error("Worker poll failed", { error });
  } finally {
    inFlight = false;
  }
}

async function main(): Promise<void> {
  logger.info("Hermes Cloud worker starting", {
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
