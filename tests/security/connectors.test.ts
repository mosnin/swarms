/**
 * Security: connector access is least-privilege. A job may only call tools
 * explicitly granted to it, and external-write tools demand approval.
 */

import { describe, expect, it } from "vitest";

import { checkConnectorAccess } from "@/server/connectors/permissionCheck";
import { crmMock, gmailDraftMock } from "@/server/connectors/mockConnector";

describe("connector least-privilege", () => {
  it("denies a tool the job was not granted", async () => {
    const res = await crmMock.callTool("lookup_contact", { email: "a@b.com" }, {
      organizationId: "org_a",
      grantedScopes: [], // nothing granted
    });
    expect(res.ok).toBe(false);
  });

  it("allows a granted read tool", async () => {
    const res = await crmMock.callTool("lookup_contact", { email: "a@b.com" }, {
      organizationId: "org_a",
      grantedScopes: ["lookup_contact"],
    });
    expect(res.ok).toBe(true);
  });

  it("requires approval for an external-write tool even when granted", async () => {
    const decision = checkConnectorAccess(
      crmMock.listTools().find((t) => t.toolName === "update_contact")!,
      ["update_contact"],
    );
    expect(decision.effect).toBe("require_approval");
  });

  it("blocks a mock email send without approval", async () => {
    const res = await gmailDraftMock.callTool("send_email", { draftId: "d1" }, {
      organizationId: "org_a",
      grantedScopes: ["send_email"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("POLICY_DENIED");
  });

  it("allows a non-write draft tool when granted", async () => {
    const res = await gmailDraftMock.callTool("create_draft", { to: "a@b.com" }, {
      organizationId: "org_a",
      grantedScopes: ["create_draft"],
    });
    expect(res.ok).toBe(true);
  });
});
