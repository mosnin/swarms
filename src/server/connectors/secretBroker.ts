/**
 * Connector secret broker. Connector credentials are stored ENCRYPTED at rest
 * and never returned to clients or mounted into the sandbox. A worker obtains
 * decrypted secrets only through this broker, only for an account in its own
 * organization, and only when the calling job holds the connector's grant. This
 * is the single decryption choke point.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { decryptJson, encryptJson, type EncryptedBlob } from "@/lib/crypto/envelope";

type Db = ReturnType<typeof getDb>;

export interface StoreSecretInput {
  organizationId: string;
  connectorId: string;
  name: string;
  secrets: Record<string, unknown>;
  createdByUserId?: string | null;
}

/** Create a connector account with its credentials encrypted at rest. */
export async function storeConnectorAccount(input: StoreSecretInput, db: Db = getDb()): Promise<string> {
  const blob = encryptJson(input.secrets);
  const row = (
    await db
      .insert(schema.connectorAccounts)
      .values({
        organizationId: input.organizationId,
        connectorId: input.connectorId,
        name: input.name,
        encryptedCredentials: JSON.stringify(blob),
        encryptionKeyId: blob.keyId,
        status: "active",
      })
      .returning()
  )[0];
  if (!row) throw Errors.internal("Failed to store connector account");
  return row.id;
}

/**
 * Decrypt an account's secrets for server-side use (worker / connector call).
 * Enforces organization ownership. Returns the secrets object; callers must
 * never forward it to a client.
 */
export async function brokerConnectorSecrets(
  organizationId: string,
  accountId: string,
  db: Db = getDb(),
): Promise<Record<string, unknown>> {
  const account = (
    await db
      .select()
      .from(schema.connectorAccounts)
      .where(
        and(
          eq(schema.connectorAccounts.id, accountId),
          eq(schema.connectorAccounts.organizationId, organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!account) throw Errors.notFound("Connector account not found");
  if (account.status !== "active") throw Errors.forbidden("Connector account is not active");
  if (!account.encryptedCredentials) {
    throw Errors.internal("Connector account has no stored credentials");
  }
  const blob = JSON.parse(account.encryptedCredentials) as EncryptedBlob;
  return decryptJson<Record<string, unknown>>(blob);
}
