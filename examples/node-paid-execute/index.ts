/**
 * Example: paid execution via x402. The signer turns the server's payment
 * requirements into an `X-PAYMENT` header. Here it is a stand-in; a real signer
 * settles on the configured x402 network and returns the encoded proof.
 */

import {
  HermesCloudClient,
  generateIdempotencyKey,
  type PaymentRequirements,
  type PaymentSigner,
} from "@hermes-cloud/sdk";

// DEV STAND-IN: encodes a mock proof. Replace with a real x402 wallet signer.
const mockSigner: PaymentSigner = {
  async sign(requirements: PaymentRequirements): Promise<string> {
    const proof = {
      scheme: requirements.scheme,
      nonce: requirements.nonce,
      binding: requirements.binding,
      txRef: `0xmocktx_${requirements.nonce}`,
    };
    return Buffer.from(JSON.stringify(proof)).toString("base64");
  },
};

async function main(): Promise<void> {
  const client = new HermesCloudClient({
    baseUrl: process.env.HERMES_CLOUD_URL ?? "http://localhost:3000",
    apiKey: process.env.HERMES_CLOUD_API_KEY ?? "",
  });

  const result = await client.executePaidSkill(
    {
      skillSlug: "code-review",
      input: { repo: "acme/app" },
      idempotencyKey: generateIdempotencyKey(),
    },
    { signer: mockSigner },
  );

  if (result.kind === "payment_required") {
    console.log("payment required:", result.requirements);
  } else {
    console.log("paid job created:", result.response.jobId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
