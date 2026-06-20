import { describe, expect, it } from "vitest";

import { checkConnectorAccess } from "@/server/connectors/permissionCheck";
import { getConnector, listConnectors } from "@/server/connectors/connectorRegistry";
import { crmMock, webSearchMock } from "@/server/connectors/mockConnector";
import { toMcpServer } from "@/server/connectors/mcpAdapter";
import type { ConnectorToolDef } from "@/server/connectors/types";

const readTool: ConnectorToolDef = {
  toolName: "lookup",
  description: "",
  inputSchema: {},
  outputSchema: {},
  operationType: "read",
  riskLevel: "low",
  requiresApproval: false,
  externalWrite: false,
};

const writeTool: ConnectorToolDef = { ...readTool, toolName: "send", externalWrite: true };

describe("checkConnectorAccess", () => {
  it("denies a tool that is not granted", () => {
    expect(checkConnectorAccess(readTool, []).effect).toBe("deny");
  });
  it("allows a granted read tool", () => {
    expect(checkConnectorAccess(readTool, ["lookup"]).effect).toBe("allow");
  });
  it("requires approval for a granted external-write tool", () => {
    expect(checkConnectorAccess(writeTool, ["send"]).effect).toBe("require_approval");
  });
  it("allows an external-write tool once approval is satisfied", () => {
    expect(checkConnectorAccess(writeTool, ["send"], true).effect).toBe("allow");
  });
});

describe("registry", () => {
  it("registers the three mock connectors", () => {
    expect(listConnectors().map((c) => c.slug).sort()).toEqual([
      "crm_mock",
      "gmail_draft_mock",
      "web_search_mock",
    ]);
  });
  it("resolves a connector by slug", () => {
    expect(getConnector("web_search_mock")?.name).toBe("Web Search (mock)");
    expect(getConnector("nope")).toBeNull();
  });
});

describe("mock connector callTool", () => {
  const ctx = { organizationId: "org_1", grantedScopes: ["search"] };

  it("returns deterministic output for a granted call", async () => {
    const res = await webSearchMock.callTool("search", { query: "hermes" }, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.output).toMatchObject({ results: expect.any(Array) });
  });

  it("fails an ungranted call", async () => {
    const res = await webSearchMock.callTool("search", {}, { ...ctx, grantedScopes: [] });
    expect(res.ok).toBe(false);
  });

  it("blocks an external write without approval", async () => {
    const res = await crmMock.callTool("update_contact", {}, {
      organizationId: "org_1",
      grantedScopes: ["update_contact"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("POLICY_DENIED");
  });
});

describe("mcp adapter", () => {
  it("exposes tools and proxies calls", async () => {
    const mcp = toMcpServer(webSearchMock);
    expect(mcp.listTools().map((t) => t.name)).toContain("search");
    const result = await mcp.callTool("search", { query: "x" }, {
      organizationId: "org_1",
      grantedScopes: ["search"],
    });
    expect(result.isError).toBe(false);
  });
});
