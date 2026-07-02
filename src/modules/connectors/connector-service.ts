/**
 * Connector service: authenticated catalog + tool invocation. Enforces that the
 * caller (a job/agent) only invokes tools explicitly granted to it, requires
 * approval for external writes, and writes an audit event for every call.
 */

import { and, eq, isNull, or } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { getConnector, listConnectors } from "@/server/connectors/connectorRegistry";
import { checkConnectorAccess } from "@/server/connectors/permissionCheck";
import type { ConnectorToolDef } from "@/server/connectors/types";

type Db = ReturnType<typeof getDb>;

/**
 * Resolve the tool scopes actually granted to the caller for a connector,
 * from the server-side `connector_permissions` grants (org-scoped, optionally
 * narrowed to the grantee user). NEVER derived from client input — a caller
 * cannot self-declare its own privileges. Returns an empty set (fail-closed)
 * when no grant is provisioned for the connector.
 */
export async function resolveGrantedScopes(
  ctx: AuthContext,
  connectorSlug: string,
  db: Db = getDb(),
): Promise<string[]> {
  const connector = (
    await db
      .select({ id: schema.connectors.id })
      .from(schema.connectors)
      .where(
        and(
          eq(schema.connectors.organizationId, ctx.organizationId),
          eq(schema.connectors.slug, connectorSlug),
        ),
      )
      .limit(1)
  )[0];
  if (!connector) return [];

  const userId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  const grants = await db
    .select({ scopes: schema.connectorPermissions.scopes })
    .from(schema.connectorPermissions)
    .where(
      and(
        eq(schema.connectorPermissions.organizationId, ctx.organizationId),
        eq(schema.connectorPermissions.connectorId, connector.id),
        // Org-wide grants (no grantee) apply to everyone; user-scoped grants
        // apply only to that user.
        userId
          ? or(
              isNull(schema.connectorPermissions.granteeUserId),
              eq(schema.connectorPermissions.granteeUserId, userId),
            )
          : isNull(schema.connectorPermissions.granteeUserId),
      ),
    );

  return [...new Set(grants.flatMap((g) => g.scopes))];
}

export interface ConnectorCatalogEntry {
  slug: string;
  name: string;
  riskLevel: string;
  tools: ConnectorToolDef[];
}

export function listConnectorCatalog(ctx: AuthContext): ConnectorCatalogEntry[] {
  requirePermission(ctx, "connectors.read");
  return listConnectors().map((c) => ({
    slug: c.slug,
    name: c.name,
    riskLevel: c.riskLevel,
    tools: c.listTools(),
  }));
}

export interface CallToolInput {
  connectorSlug: string;
  toolName: string;
  input: unknown;
  jobId?: string;
  /** Set when a prior approval has been recorded for this external write. */
  approvalSatisfied?: boolean;
}

export async function callConnectorTool(
  ctx: AuthContext,
  params: CallToolInput,
  db: Db = getDb(),
): Promise<{ output: unknown }> {
  requirePermission(ctx, "connectors.read");

  const connector = getConnector(params.connectorSlug);
  if (!connector) throw Errors.notFound(`Connector "${params.connectorSlug}" not found`);

  const tool = connector.listTools().find((t) => t.toolName === params.toolName);
  if (!tool) throw Errors.notFound(`Tool "${params.toolName}" not found`);

  // Grants are resolved server-side from provisioned permissions — never taken
  // from the request. A caller cannot escalate by self-declaring scopes.
  const grantedScopes = await resolveGrantedScopes(ctx, params.connectorSlug, db);

  const decision = checkConnectorAccess(tool, grantedScopes, params.approvalSatisfied);

  // Audit every call attempt (allowed or not) — connector.called.
  await writeAudit(ctx, {
    action: "connector.called",
    resourceType: "connector",
    resourceId: params.connectorSlug,
    after: {
      tool: params.toolName,
      effect: decision.effect,
      jobId: params.jobId ?? null,
      externalWrite: tool.externalWrite,
    },
  });

  if (decision.effect === "deny") throw Errors.forbidden(decision.reason);
  if (decision.effect === "require_approval") throw Errors.policyDenied(decision.reason);

  const result = await connector.callTool(params.toolName, params.input, {
    organizationId: ctx.organizationId,
    jobId: params.jobId,
    grantedScopes,
  });
  if (!result.ok) {
    throw Errors.upstream(result.error.message);
  }
  return { output: result.output };
}
