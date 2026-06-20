import { describe, expect, it } from "vitest";

import { isAppError } from "@/lib/errors";
import {
  agentContext,
  assertScopesGrantable,
  can,
  requireOrganization,
  requirePermission,
  userContext,
} from "@/modules/identity/access-control";

const ORG = "org_main";

function owner() {
  return userContext({
    organizationId: ORG,
    userId: "usr_o",
    membershipId: "mem_o",
    role: "owner",
  });
}
function viewer() {
  return userContext({
    organizationId: ORG,
    userId: "usr_v",
    membershipId: "mem_v",
    role: "viewer",
  });
}
function agent(scopes: string[] = []) {
  return agentContext({ organizationId: ORG, apiKeyId: "key_a", userId: null, scopes });
}

function expectForbidden(fn: () => void) {
  try {
    fn();
    throw new Error("expected a thrown error");
  } catch (e) {
    expect(isAppError(e) && e.code).toBe("FORBIDDEN");
  }
}

describe("owner access", () => {
  it("holds every permission", () => {
    const ctx = owner();
    for (const p of [
      "org.manage",
      "api_keys.manage",
      "billing.manage",
      "policies.manage",
    ] as const) {
      expect(can(ctx, p)).toBe(true);
      expect(() => requirePermission(ctx, p)).not.toThrow();
    }
  });

  it("can grant any scope it holds", () => {
    expect(() => assertScopesGrantable(owner(), ["billing.manage", "skills.create"])).not.toThrow();
  });
});

describe("viewer access", () => {
  it("is read-only", () => {
    const ctx = viewer();
    expect(can(ctx, "org.read")).toBe(true);
    expect(can(ctx, "skills.read")).toBe(true);
    expect(can(ctx, "skills.create")).toBe(false);
    expect(can(ctx, "api_keys.manage")).toBe(false);
    expectForbidden(() => requirePermission(ctx, "skills.create"));
    expectForbidden(() => requirePermission(ctx, "api_keys.manage"));
  });

  it("cannot grant scopes it does not hold", () => {
    expectForbidden(() => assertScopesGrantable(viewer(), ["skills.create"]));
  });
});

describe("agent (API key) access", () => {
  it("uses agent defaults when no scopes are set", () => {
    const ctx = agent();
    expect(ctx.actor.kind).toBe("agent");
    expect(can(ctx, "skills.execute")).toBe(true);
    expect(can(ctx, "jobs.create")).toBe(true);
    expect(can(ctx, "api_keys.manage")).toBe(false);
    expect(can(ctx, "skills.create")).toBe(false);
    expectForbidden(() => requirePermission(ctx, "api_keys.manage"));
  });

  it("is constrained to explicit scopes when provided", () => {
    const ctx = agent(["skills.read"]);
    expect(can(ctx, "skills.read")).toBe(true);
    expect(can(ctx, "skills.execute")).toBe(false);
    expect(can(ctx, "jobs.create")).toBe(false);
  });

  it("ignores invalid scope strings", () => {
    const ctx = agent(["skills.read", "not.a.permission"]);
    expect(can(ctx, "skills.read")).toBe(true);
    expect(ctx.permissions.size).toBe(1);
  });
});

describe("organization scoping", () => {
  it("allows same-org access and denies cross-tenant access", () => {
    const ctx = owner();
    expect(() => requireOrganization(ctx, ORG)).not.toThrow();
    expectForbidden(() => requireOrganization(ctx, "org_other"));
  });
});
