import { describe, expect, it } from "vitest";

import {
  PERMISSIONS,
  permissionsForRole,
  roleHasPermission,
  sanitizePermissions,
} from "@/modules/identity/roles";

describe("role/permission matrix", () => {
  it("owner has every permission", () => {
    const owner = permissionsForRole("owner");
    expect(owner.size).toBe(PERMISSIONS.length);
  });

  it("admin has everything except billing.manage", () => {
    expect(roleHasPermission("admin", "org.manage")).toBe(true);
    expect(roleHasPermission("admin", "policies.manage")).toBe(true);
    expect(roleHasPermission("admin", "billing.manage")).toBe(false);
  });

  it("viewer is read-only", () => {
    const viewer = permissionsForRole("viewer");
    for (const p of viewer) expect(p.endsWith(".read")).toBe(true);
  });

  it("agent can execute but not author or manage", () => {
    expect(roleHasPermission("agent", "skills.execute")).toBe(true);
    expect(roleHasPermission("agent", "jobs.create")).toBe(true);
    expect(roleHasPermission("agent", "skills.create")).toBe(false);
    expect(roleHasPermission("agent", "api_keys.manage")).toBe(false);
  });

  it("sanitizePermissions drops unknown values", () => {
    expect(sanitizePermissions(["org.read", "nope", "jobs.create"])).toEqual([
      "org.read",
      "jobs.create",
    ]);
  });
});
