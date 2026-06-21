import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import { executeSkill } from "@/modules/execution/job-repository";
import { processJobInDb } from "@/modules/execution/worker";
import { reconcileOrganization } from "@/modules/billing/reconciliation";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

const manifest = {
  name: "Echo",
  version: "1.0.0",
  description: "",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  permissions: [],
  riskLevel: "low",
  estimatedCostMinor: 200,
  estimatedDurationMs: 1,
  maxRuntimeMs: 5000,
  supportsParallelism: false,
};

describe("integration: ledger reconciliation", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    ({ db } = await createTestDb());
  });
  afterEach(() => setJobQueue(undefined));

  it("reconciles cleanly after a real charged execution, and flags injected drift", async () => {
    const { organizationId, userId } = await seedOrg(db);
    const skill = (
      await db
        .insert(schema.skills)
        .values({ organizationId, slug: "echo", name: "Echo", visibility: "private", defaultPriceMinor: 200 })
        .returning()
    )[0]!;
    await db.insert(schema.skillVersions).values({
      skillId: skill.id,
      organizationId,
      version: "1.0.0",
      status: "published",
      publishedAt: new Date(),
      manifest,
      inputSchema: manifest.inputSchema,
      outputSchema: manifest.outputSchema,
      runnerType: "mock",
      priceMinor: 200,
      priceCurrency: "USD",
    });
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const res = await executeSkill(ctx, { skillSlug: "echo", input: {}, idempotencyKey: "rec-key-0001" }, db);
    await processJobInDb(res.jobId, db);

    const clean = await reconcileOrganization(ctx, db);
    expect(clean.ok).toBe(true);
    expect(clean.jobsChecked).toBe(1);
    expect(clean.discrepancies).toEqual([]);

    // Inject a fake receipt with no matching ledger payment entry → drift.
    const attempt = (
      await db
        .insert(schema.x402PaymentAttempts)
        .values({
          organizationId,
          idempotencyKey: "fake",
          amountMinor: 999,
          currency: "USD",
          scheme: "x402-mock",
          nonce: "n",
          binding: "b",
          status: "settled",
        })
        .returning()
    )[0]!;
    await db.insert(schema.x402PaymentReceipts).values({
      organizationId,
      paymentAttemptId: attempt.id,
      amountMinor: 999,
      currency: "USD",
      txRef: "0xorphan_tx",
      binding: "b",
    });

    const drift = await reconcileOrganization(ctx, db);
    expect(drift.ok).toBe(false);
    expect(drift.discrepancies.some((d) => d.kind === "missing_payment_entry")).toBe(true);
  });
});
