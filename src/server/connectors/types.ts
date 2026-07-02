/**
 * Connector abstraction. Connectors expose external tools (web search, CRM,
 * email, …) to skills and workers. The design is intentionally MCP-compatible:
 * a connector advertises a list of tools, and a tool is invoked by name with a
 * validated input — mirroring MCP's `listTools` / `callTool` without requiring a
 * full MCP server yet. Real provider integrations are out of scope here; this
 * phase ships mock connectors only.
 *
 * Security: a worker only ever receives the connector capabilities explicitly
 * granted to its job; secrets never leave the server; destructive/external-write
 * operations can require approval.
 */

export type ConnectorRiskLevel = "low" | "medium" | "high" | "critical";
export type OperationType = "read" | "write" | "search" | "send" | "delete";

export interface ConnectorToolDef {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  operationType: OperationType;
  riskLevel: ConnectorRiskLevel;
  requiresApproval: boolean;
  externalWrite: boolean;
}

export interface ConnectorCallContext {
  organizationId: string;
  jobId?: string;
  /** Scopes (tool names) the caller has been granted for this connector. */
  grantedScopes: readonly string[];
}

export type ConnectorCallResult =
  | { ok: true; output: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface Connector {
  readonly slug: string;
  readonly name: string;
  readonly riskLevel: ConnectorRiskLevel;
  /** MCP-style tool discovery. */
  listTools(): ConnectorToolDef[];
  /** MCP-style tool invocation. Implementations must validate input. */
  callTool(toolName: string, input: unknown, ctx: ConnectorCallContext): Promise<ConnectorCallResult>;
}
