/**
 * Connector access control (pure + testable). A job may only invoke a connector
 * tool that was explicitly granted to it, and external-write / high-risk tools
 * may demand human approval. This is the single decision point both the call
 * endpoint and the worker broker consult.
 */

import type { ConnectorToolDef } from "@/server/connectors/types";

export type ConnectorAccessEffect = "allow" | "deny" | "require_approval";

export interface ConnectorAccessDecision {
  effect: ConnectorAccessEffect;
  reason: string;
}

/**
 * Decide whether a tool call is permitted given the caller's granted scopes.
 * - Not granted → deny (unauthorized).
 * - Granted but external-write / explicitly requiresApproval → require_approval.
 * - Otherwise → allow.
 */
export function checkConnectorAccess(
  tool: ConnectorToolDef,
  grantedScopes: readonly string[],
  approvalSatisfied = false,
): ConnectorAccessDecision {
  if (!grantedScopes.includes(tool.toolName)) {
    return { effect: "deny", reason: `Tool "${tool.toolName}" is not granted to this job` };
  }
  if ((tool.requiresApproval || tool.externalWrite) && !approvalSatisfied) {
    return {
      effect: "require_approval",
      reason: `Tool "${tool.toolName}" performs an external write and requires approval`,
    };
  }
  return { effect: "allow", reason: "granted" };
}
