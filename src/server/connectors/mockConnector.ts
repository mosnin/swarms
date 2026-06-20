/**
 * Mock connectors for development and demos. They return deterministic output
 * and perform NO real external I/O (no real web search, CRM, or Gmail). They
 * exist so the connector permissioning, auditing, and approval flows can be
 * exercised end-to-end safely. Enforces granted-scope access on every call.
 */

import { checkConnectorAccess } from "@/server/connectors/permissionCheck";
import type {
  Connector,
  ConnectorCallContext,
  ConnectorCallResult,
  ConnectorRiskLevel,
  ConnectorToolDef,
} from "@/server/connectors/types";

type ToolHandler = (input: unknown) => unknown;

export class MockConnector implements Connector {
  constructor(
    readonly slug: string,
    readonly name: string,
    readonly riskLevel: ConnectorRiskLevel,
    private readonly tools: ConnectorToolDef[],
    private readonly handlers: Record<string, ToolHandler>,
  ) {}

  listTools(): ConnectorToolDef[] {
    return this.tools;
  }

  async callTool(
    toolName: string,
    input: unknown,
    ctx: ConnectorCallContext,
  ): Promise<ConnectorCallResult> {
    const tool = this.tools.find((t) => t.toolName === toolName);
    if (!tool) {
      return { ok: false, error: { code: "NOT_FOUND", message: `Unknown tool "${toolName}"` } };
    }
    const decision = checkConnectorAccess(tool, ctx.grantedScopes);
    if (decision.effect === "deny") {
      return { ok: false, error: { code: "FORBIDDEN", message: decision.reason } };
    }
    if (decision.effect === "require_approval") {
      return { ok: false, error: { code: "POLICY_DENIED", message: decision.reason } };
    }
    const handler = this.handlers[toolName];
    if (!handler) {
      return { ok: false, error: { code: "INTERNAL", message: "No handler for tool" } };
    }
    return { ok: true, output: handler(input) };
  }
}

const obj = (properties: Record<string, unknown> = {}) => ({ type: "object", properties });

export const webSearchMock = new MockConnector(
  "web_search_mock",
  "Web Search (mock)",
  "low",
  [
    {
      toolName: "search",
      description: "Search the web (mock results)",
      inputSchema: obj({ query: { type: "string" } }),
      outputSchema: obj({ results: { type: "array" } }),
      operationType: "search",
      riskLevel: "low",
      requiresApproval: false,
      externalWrite: false,
    },
  ],
  {
    search: (input) => {
      const query = (input as { query?: string })?.query ?? "";
      return {
        results: [
          { title: `Mock result for "${query}"`, url: "https://example.com/1" },
          { title: `Another result for "${query}"`, url: "https://example.com/2" },
        ],
      };
    },
  },
);

export const crmMock = new MockConnector(
  "crm_mock",
  "CRM (mock)",
  "medium",
  [
    {
      toolName: "lookup_contact",
      description: "Look up a contact (mock)",
      inputSchema: obj({ email: { type: "string" } }),
      outputSchema: obj({ contact: { type: "object" } }),
      operationType: "read",
      riskLevel: "low",
      requiresApproval: false,
      externalWrite: false,
    },
    {
      toolName: "update_contact",
      description: "Update a contact (mock external write)",
      inputSchema: obj({ email: { type: "string" }, fields: { type: "object" } }),
      outputSchema: obj({ updated: { type: "boolean" } }),
      operationType: "write",
      riskLevel: "high",
      requiresApproval: true,
      externalWrite: true,
    },
  ],
  {
    lookup_contact: (input) => ({
      contact: { email: (input as { email?: string })?.email, name: "Mock Contact", stage: "lead" },
    }),
    update_contact: () => ({ updated: true }),
  },
);

export const gmailDraftMock = new MockConnector(
  "gmail_draft_mock",
  "Gmail Draft (mock)",
  "high",
  [
    {
      toolName: "create_draft",
      description: "Create an email draft (mock; not sent)",
      inputSchema: obj({ to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }),
      outputSchema: obj({ draftId: { type: "string" } }),
      operationType: "write",
      riskLevel: "medium",
      requiresApproval: false,
      externalWrite: false,
    },
    {
      toolName: "send_email",
      description: "Send an email (mock external write; requires approval)",
      inputSchema: obj({ draftId: { type: "string" } }),
      outputSchema: obj({ sent: { type: "boolean" } }),
      operationType: "send",
      riskLevel: "critical",
      requiresApproval: true,
      externalWrite: true,
    },
  ],
  {
    create_draft: () => ({ draftId: "draft_mock_001" }),
    send_email: () => ({ sent: true }),
  },
);
