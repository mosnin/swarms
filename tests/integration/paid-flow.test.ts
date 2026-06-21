import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { userContext } from "@/modules/identity/access-control";
import { executePaidSkill } from "@/modules/billing/payment-repository";
import { bindingDigest } from "@/modules/billing/payment-service";
import { reconcileOrganization } from "@/modules/billing/reconciliation";
import { processJobInDb } from "@/modules/execution/worker";
import { MockPaymentProvider } from "@/server/payments/mockProvider";
import { setPaymentProvider } from "@/server/payments/config";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { createTestDb, seedOrg, type TestDb } from "./harness";

const manifest = {
  name: "Premium",
  version: "1.0.0",
  description: "",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  permissions: [],
  riskLevel: "low",
  estimatedCostMinor: 500,
  estimatedDurationMs: 1,
  maxRuntimeMs: 5000,
  supportsParallelism: false,
};

async function publishPaidSkill(db: TestDb, organizationId: string) {
  const skill = (
    await db
      .insert(schema.skills)
      .values({ organizationId, slug: "premium", name: "Premium", visibility: "private", defaultPriceMinor: 500 })
      .returning()
  )[0]!;
  const version = (
    await db
      .insert(schema.skillVersions)
      .values({
        skillId: skill.id,
        organizationId,
        version: "1.0.0",
        status: "published",
        publishedAt: new Date(),
        manifest,
        inputSchema: manifest.inputSchema,
        outputSchema: manifest.outputSchema,
        runnerType: "mock",
        priceMinor: 500,
        priceCurrency: "USD",
      })
      .returning()
  )[0]!;
  return version.id;
}

describe("integration: paid execution (x402)", () => {
  let db: TestDb;
  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    setPaymentProvider(new MockPaymentProvider("0xPAYTO", "base-sepolia"));
    ({ db } = await createTestDb());
  });
  afterEach(() => {
    setJobQueue(undefined);
    setPaymentProvider(undefined);
  });

  it("returns 402 requirements unpaid, then settles + binds receipt + runs", async () => {
    const { organizationId, userId } = await seedOrg(db);
    const versionId = await publishPaidSkill(db, organizationId);
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const request = { skillSlug: "premium", input: {}, idempotencyKey: "paid-key-0001" };

    // Unpaid → payment required.
    const unpaid = await executePaidSkill(ctx, request, null, db);
    expect(unpaid.kind).toBe("payment_required");

    // Build a valid mock proof bound to this exact request.
    const digest = bindingDigest({
      organizationId,
      skillVersionId: versionId,
      idempotencyKey: "paid-key-0001",
      amountMinor: 500,
      currency: "USD",
    });
    const proof = { scheme: "x402-mock", nonce: "n", binding: digest, txRef: "0xtx_abcdef12" };

    const paid = await executePaidSkill(ctx, request, proof, db);
    expect(paid.kind).toBe("ok");
    if (paid.kind !== "ok") return;

    // Receipt bound to org + job; payment ledger credit recorded.
    const receipts = await db
      .select()
      .from(schema.x402PaymentReceipts)
      .where(eq(schema.x402PaymentReceipts.organizationId, organizationId));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.jobId).toBe(paid.response.jobId);

    const payments = await db
      .select()
      .from(schema.usageLedgerEntries)
      .where(eq(schema.usageLedgerEntries.jobId, paid.response.jobId));
    expect(payments.some((e) => e.kind === "payment" && e.amountMinor === 500)).toBe(true);

    // Run the job; reconciliation is clean.
    await processJobInDb(paid.response.jobId, db);
    const report = await reconcileOrganization(ctx, db);
    expect(report.ok).toBe(true);
  });

  it("does not double-charge on idempotent replay; one settlement funds one job", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-paid2");
    const versionId = await publishPaidSkill(db, organizationId);
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const request = { skillSlug: "premium", input: {}, idempotencyKey: "paid-key-0002" };
    const digest = bindingDigest({
      organizationId,
      skillVersionId: versionId,
      idempotencyKey: "paid-key-0002",
      amountMinor: 500,
      currency: "USD",
    });
    const proof = { scheme: "x402-mock", nonce: "n", binding: digest, txRef: "0xtx_99887766" };

    const first = await executePaidSkill(ctx, request, proof, db);
    const second = await executePaidSkill(ctx, request, proof, db);
    expect(first.kind).toBe("ok");
    expect(second.kind).toBe("ok");

    const receipts = await db
      .select()
      .from(schema.x402PaymentReceipts)
      .where(eq(schema.x402PaymentReceipts.organizationId, organizationId));
    expect(receipts).toHaveLength(1); // no second charge
    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.organizationId, organizationId));
    expect(jobs).toHaveLength(1);
  });
});
