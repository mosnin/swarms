/**
 * Example: the Hermes agent (Nous Research) executes a free skill and streams
 * its logs. Run with real env: HERMES_CLOUD_URL + HERMES_CLOUD_API_KEY.
 */

import { HermesCloudClient, generateIdempotencyKey } from "@hermes-cloud/sdk";

async function main(): Promise<void> {
  const client = new HermesCloudClient({
    baseUrl: process.env.HERMES_CLOUD_URL ?? "http://localhost:3000",
    apiKey: process.env.HERMES_CLOUD_API_KEY ?? "",
  });

  const job = await client.executeSkill({
    skillSlug: "web-summarize",
    input: { url: "https://example.com" },
    idempotencyKey: generateIdempotencyKey(),
  });
  console.log("created job", job.jobId, job.status);

  for await (const log of client.streamJobLogs(job.jobId)) {
    console.log(`[${log.level}] ${log.message}`);
  }

  const final = await client.getJob(job.jobId);
  console.log("final status", final.status, "output:", final.output);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
