/**
 * Example: spawn a sandboxed worker agent, hand it your resources, watch it work.
 * Run with env: HERMES_CLOUD_URL + HERMES_CLOUD_API_KEY.
 */

import { HermesCloudClient, generateIdempotencyKey, budget } from "@hermes-cloud/sdk";

async function main(): Promise<void> {
  const client = new HermesCloudClient({
    baseUrl: process.env.HERMES_CLOUD_URL ?? "http://localhost:3000",
    apiKey: process.env.HERMES_CLOUD_API_KEY ?? "",
  });

  const spawned = await client.spawnAgent({
    task: "Read the notes and draft three follow-up tasks.",
    resources: {
      context: "The notes are about Q3 planning.",
      env: { NOTION_TOKEN: process.env.NOTION_TOKEN ?? "" },
    },
    idempotencyKey: generateIdempotencyKey(),
    ...budget(200),
  });
  console.log("spawned agent", spawned.jobId, "GPU ceiling", spawned.maxGpuSeconds + "s");
  console.log("inherited:", spawned.resources);

  for await (const log of client.streamJobLogs(spawned.jobId)) {
    console.log(`[${log.level}] ${log.message}`);
  }
  const final = await client.getJob(spawned.jobId);
  console.log("result:", final.output);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
