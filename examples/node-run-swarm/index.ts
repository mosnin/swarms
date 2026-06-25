/**
 * Example: spawn a workforce (a swarm of agents) and print the per-worker result.
 */

import { SwarmsClient, budget, generateIdempotencyKey } from "@swarms/sdk";

async function main(): Promise<void> {
  const client = new SwarmsClient({
    baseUrl: process.env.SWARMS_URL ?? "http://localhost:3000",
    apiKey: process.env.SWARMS_API_KEY ?? "",
  });

  const run = await client.spawnSwarm({
    objective: "Analyze Acme Corp's pricing and positioning",
    tasks: [
      "Summarize Acme's public pricing",
      "List Acme's positioning claims",
      "Propose three competitive risks",
    ],
    resources: { context: "We sell a competing developer tool." },
    idempotencyKey: generateIdempotencyKey(),
    ...budget(5000),
  });

  console.log("swarm", run.swarmRunId, run.status, "cost:", run.costMinor);
  for (const worker of run.workers) {
    console.log(`- ${worker.role}: ${worker.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
