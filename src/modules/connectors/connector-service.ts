/**
 * Connector service: authenticated catalog + tool invocation. Enforces that the
 * caller (a job/agent) only invokes tools explicitly granted to it, requires
 * approval for external writes, and writes an audit event for every call.
 */

import { Errors } from "@/lib/errors";
import { requirePermission, type AuthContext } from "@/modules/identity/access-control";
import { writeAudit } from "@/modules/governance/audit";
import { getConnector, listConnectors } from "@/server/connectors/connectorRegistry";
import { checkConnectorAccess } from "@/server/connectors/permissionCheck";
import type { ConnectorToolDef } from "@/server/connectors/types";

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
  /** Tool names granted to the calling job/agent. */
  grantedScopes: string[];
  jobId?: string;
  /** Set when a prior approval has been recorded for this external write. */
  approvalSatisfied?: boolean;
}

export async function callConnectorTool(
  ctx: AuthContext,
  params: CallToolInput,
): Promise<{ output: unknown }> {
  requirePermission(ctx, "connectors.read");

  const connector = getConnector(params.connectorSlug);
  if (!connector) throw Errors.notFound(`Connector "${params.connectorSlug}" not found`);

  const tool = connector.listTools().find((t) => t.toolName === params.toolName);
  if (!tool) throw Errors.notFound(`Tool "${params.toolName}" not found`);

  const decision = checkConnectorAccess(tool, params.grantedScopes, params.approvalSatisfied);

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
    grantedScopes: params.grantedScopes,
  });
  if (!result.ok) {
    throw Errors.upstream(result.error.message);
  }
  return { output: result.output };
}
