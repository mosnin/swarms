/**
 * Resource bundles — the heart of the product. A parent agent hands its spawned
 * worker the SAME resources it has outside the platform: environment secrets,
 * working files, MCP servers / tools, and task context. Without this a spawned
 * agent has no context and no ability to act.
 *
 * The bundle is encrypted at rest (AES-256-GCM) and only ever decrypted
 * server-side, immediately before injection into the agent's sandbox. A
 * non-sensitive summary (counts + tool/server names, never values) is stored for
 * display and audit.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { decryptJson, encryptJson } from "@/lib/crypto/envelope";

type Db = ReturnType<typeof getDb>;

export interface McpServerSpec {
  name: string;
  url: string;
  /** Optional bearer token / auth, injected only inside the sandbox. */
  token?: string;
}

export interface ResourceBundle {
  /** Environment variables / secrets (API keys the worker needs). */
  env?: Record<string, string>;
  /** Files the worker should have in its workspace (path -> contents). */
  files?: Record<string, string>;
  /** MCP servers the worker may call (inherited tool access). */
  mcpServers?: McpServerSpec[];
  /** Background/context the worker needs to do the task. */
  context?: string;
}

export interface BundleSummary {
  envKeys: string[];
  fileCount: number;
  mcpServers: string[];
  hasContext: boolean;
}

/** Non-sensitive summary (names/counts only, never values). */
export function summarize(bundle: ResourceBundle): BundleSummary {
  return {
    envKeys: Object.keys(bundle.env ?? {}),
    fileCount: Object.keys(bundle.files ?? {}).length,
    mcpServers: (bundle.mcpServers ?? []).map((s) => s.name),
    hasContext: Boolean(bundle.context && bundle.context.length > 0),
  };
}

/** Store an encrypted resource bundle; returns its id. */
export async function storeResourceBundle(
  organizationId: string,
  bundle: ResourceBundle,
  createdByUserId: string | null,
  db: Db = getDb(),
): Promise<string> {
  const blob = encryptJson(bundle);
  const row = (
    await db
      .insert(schema.resourceBundles)
      .values({
        organizationId,
        createdByUserId,
        encrypted: JSON.stringify(blob),
        encryptionKeyId: blob.keyId,
        summary: summarize(bundle),
      })
      .returning()
  )[0];
  if (!row) throw Errors.internal("Failed to store resource bundle");
  return row.id;
}

/**
 * Decrypt a bundle for injection into a sandbox. Org-scoped — the single
 * decryption choke point. Never return this to a client.
 */
export async function openResourceBundle(
  organizationId: string,
  bundleId: string,
  db: Db = getDb(),
): Promise<ResourceBundle> {
  const row = (
    await db
      .select()
      .from(schema.resourceBundles)
      .where(
        and(
          eq(schema.resourceBundles.id, bundleId),
          eq(schema.resourceBundles.organizationId, organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) throw Errors.notFound("Resource bundle not found");
  return decryptJson<ResourceBundle>(JSON.parse(row.encrypted));
}
