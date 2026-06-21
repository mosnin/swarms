import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { brokerConnectorSecrets, storeConnectorAccount } from "@/server/connectors/secretBroker";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: connector secret broker", () => {
  let db: TestDb;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  it("stores credentials encrypted and brokers them only within the org", async () => {
    const { organizationId } = await seedOrg(db);
    const connector = (
      await db
        .insert(schema.connectors)
        .values({ organizationId, slug: "crm", name: "CRM", provider: "crm" })
        .returning()
    )[0]!;

    const accountId = await storeConnectorAccount(
      { organizationId, connectorId: connector.id, name: "acct", secrets: { apiKey: "TOPSECRET" } },
      db,
    );

    // Stored value is encrypted (plaintext not present).
    const row = (
      await db.select().from(schema.connectorAccounts).where(eq(schema.connectorAccounts.id, accountId))
    )[0]!;
    expect(row.encryptedCredentials).not.toContain("TOPSECRET");
    expect(row.encryptionKeyId).toBeTruthy();

    // Broker decrypts for the owning org.
    const secrets = await brokerConnectorSecrets(organizationId, accountId, db);
    expect(secrets).toEqual({ apiKey: "TOPSECRET" });

    // Another org cannot broker it (not found, no existence leak).
    const other = await seedOrg(db, "other-org");
    await expect(brokerConnectorSecrets(other.organizationId, accountId, db)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
