import { describe, expect, it } from "vitest";

import {
  canViewSkill,
  filterListed,
  filterViewable,
  isListedFor,
  type ViewableSkill,
} from "@/modules/catalog/visibility";

const OWNER = "org_owner";
const OTHER = "org_other";

const privateSkill: ViewableSkill = { organizationId: OWNER, visibility: "private" };
const unlistedSkill: ViewableSkill = { organizationId: OWNER, visibility: "unlisted" };
const publicSkill: ViewableSkill = { organizationId: OWNER, visibility: "public" };

describe("canViewSkill", () => {
  it("lets the owning org view any of its skills", () => {
    expect(canViewSkill(OWNER, privateSkill)).toBe(true);
    expect(canViewSkill(OWNER, unlistedSkill)).toBe(true);
    expect(canViewSkill(OWNER, publicSkill)).toBe(true);
  });

  it("hides private skills from other orgs", () => {
    expect(canViewSkill(OTHER, privateSkill)).toBe(false);
  });

  it("lets other orgs view unlisted and public skills by reference", () => {
    expect(canViewSkill(OTHER, unlistedSkill)).toBe(true);
    expect(canViewSkill(OTHER, publicSkill)).toBe(true);
  });
});

describe("isListedFor (discovery)", () => {
  it("lists all of the owning org's skills", () => {
    expect(isListedFor(OWNER, privateSkill)).toBe(true);
    expect(isListedFor(OWNER, unlistedSkill)).toBe(true);
  });

  it("only lists public skills of other orgs", () => {
    expect(isListedFor(OTHER, publicSkill)).toBe(true);
    expect(isListedFor(OTHER, unlistedSkill)).toBe(false);
    expect(isListedFor(OTHER, privateSkill)).toBe(false);
  });
});

describe("filter helpers", () => {
  const all = [privateSkill, unlistedSkill, publicSkill];

  it("filterViewable returns reference-accessible skills for other orgs", () => {
    expect(filterViewable(OTHER, all)).toEqual([unlistedSkill, publicSkill]);
  });

  it("filterListed returns only public skills for other orgs", () => {
    expect(filterListed(OTHER, all)).toEqual([publicSkill]);
  });

  it("returns everything for the owning org", () => {
    expect(filterViewable(OWNER, all)).toHaveLength(3);
    expect(filterListed(OWNER, all)).toHaveLength(3);
  });
});
