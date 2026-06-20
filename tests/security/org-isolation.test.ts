/**
 * Security: cross-organization data must not leak. Visibility rules and tenant
 * guards keep one org's private resources invisible to another.
 */

import { describe, expect, it } from "vitest";

import { canViewSkill, isListedFor } from "@/modules/catalog/visibility";

const OWNER = "org_owner";
const OTHER = "org_other";

describe("skill visibility isolation", () => {
  it("hides a private skill from another org (no existence leak in listings)", () => {
    const skill = { organizationId: OWNER, visibility: "private" as const };
    expect(canViewSkill(OTHER, skill)).toBe(false);
    expect(isListedFor(OTHER, skill)).toBe(false);
  });

  it("does not list an unlisted skill to other orgs (reference-only)", () => {
    const skill = { organizationId: OWNER, visibility: "unlisted" as const };
    expect(isListedFor(OTHER, skill)).toBe(false);
    expect(canViewSkill(OTHER, skill)).toBe(true); // reachable by direct id only
  });

  it("lets the owning org see all of its own skills", () => {
    for (const visibility of ["private", "unlisted", "public"] as const) {
      expect(canViewSkill(OWNER, { organizationId: OWNER, visibility })).toBe(true);
    }
  });

  it("exposes public skills to everyone", () => {
    const skill = { organizationId: OWNER, visibility: "public" as const };
    expect(canViewSkill(OTHER, skill)).toBe(true);
    expect(isListedFor(OTHER, skill)).toBe(true);
  });
});
