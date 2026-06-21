/**
 * Example: launch a competitor-research swarm and print the rolled-up result.
 */

import { SwarmsClient, budget } from "@swarms/sdk";

async function main(): Promise<void> {
  const client = new SwarmsClient({
    baseUrl: process.env.SWARMS_URL ?? "http://localhost:3000",
    apiKey: process.env.SWARMS_API_KEY ?? "",
  });

  const run = await client.runSwarm({
    templateId: process.env.SWARM_TEMPLATE_ID ?? "",
    objective: "Analyze Acme Corp's pricing and positioning",
    ...budget(5000),
  });

  console.log("swarm", run.id, run.status, "cost:", run.costMinor);
  for (const agent of run.agents) {
    console.log(`- ${agent.role}: ${agent.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
