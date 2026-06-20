/**
 * Example: launch a competitor-research swarm and print the rolled-up result.
 */

import { HermesCloudClient, budget } from "@hermes-cloud/sdk";

async function main(): Promise<void> {
  const client = new HermesCloudClient({
    baseUrl: process.env.HERMES_CLOUD_URL ?? "http://localhost:3000",
    apiKey: process.env.HERMES_CLOUD_API_KEY ?? "",
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
