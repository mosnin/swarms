/**
 * Security: authorization guards must fail closed and prevent privilege
 * escalation. These assert the invariants the whole platform relies on.
 */

import { describe, expect, it } from "vitest";

import {
  agentContext,
  assertScopesGrantable,
  authorizeOrgAction,
  can,
  requireOrganization,
  requirePermission,
  userContext,
} from "@/modules/identity/access-control";

const owner = userContext({ organizationId: "org_a", userId: "u1", membershipId: "m1", role: "owner" });
const viewer = userContext({ organizationId: "org_a", userId: "u2", membershipId: "m2", role: "viewer" });

describe("permission guards fail closed", () => {
  it("viewer cannot perform mutations", () => {
    expect(can(viewer, "connectors.manage")).toBe(false);
    expect(() => requirePermission(viewer, "connectors.manage")).toThrowError(/permission/i);
    expect(() => requirePermission(viewer, "jobs.create")).toThrow();
    expect(() => requirePermission(viewer, "billing.manage")).toThrow();
  });

  it("owner holds full permissions", () => {
    expect(can(owner, "billing.manage")).toBe(true);
    expect(() => requirePermission(owner, "policies.manage")).not.toThrow();
  });

  it("admin lacks billing.manage (financial control stays with owner)", () => {
    const admin = userContext({ organizationId: "org_a", userId: "u3", membershipId: "m3", role: "admin" });
    expect(can(admin, "billing.manage")).toBe(false);
  });
});

describe("organization isolation", () => {
  it("rejects cross-tenant resource access", () => {
    expect(() => requireOrganization(owner, "org_b")).toThrowError(/cross-tenant/i);
  });
  it("allows same-tenant access", () => {
    expect(() => requireOrganization(owner, "org_a")).not.toThrow();
  });
  it("combined guard enforces both permission and tenant", () => {
    expect(() => authorizeOrgAction(owner, "jobs.create", "org_b")).toThrow();
    expect(() => authorizeOrgAction(viewer, "jobs.create", "org_a")).toThrow();
    expect(() => authorizeOrgAction(owner, "jobs.create", "org_a")).not.toThrow();
  });
});

describe("API key scope escalation is prevented", () => {
  it("a key cannot be granted scopes the creator lacks", () => {
    // viewer may not grant connectors.manage
    expect(() => assertScopesGrantable(viewer, ["connectors.manage"])).toThrow();
  });

  it("an agent key with explicit scopes is limited to those scopes", () => {
    const agent = agentContext({
      organizationId: "org_a",
      apiKeyId: "key_1",
      userId: "u1",
      scopes: ["jobs.read"],
    });
    expect(can(agent, "jobs.read")).toBe(true);
    expect(can(agent, "jobs.create")).toBe(false);
    expect(can(agent, "billing.manage")).toBe(false);
  });

  it("agent scopes are sanitized (unknown permissions dropped)", () => {
    const agent = agentContext({
      organizationId: "org_a",
      apiKeyId: "key_2",
      userId: null,
      scopes: ["jobs.read", "totally.fake"],
    });
    expect(can(agent, "jobs.read")).toBe(true);
    // The fake permission is not present.
    expect([...agent.permissions]).not.toContain("totally.fake");
  });
});
