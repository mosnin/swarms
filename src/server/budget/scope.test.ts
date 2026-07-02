import { describe, expect, it } from "vitest";

import { budgetApplies, isScoped, parseScope } from "@/server/budget/scope";

describe("parseScope", () => {
  it("treats null/empty as org-wide", () => {
    expect(parseScope(null)).toEqual({});
    expect(parseScope({})).toEqual({});
    expect(isScoped(parseScope(null))).toBe(false);
  });

  it("extracts known string constraints only", () => {
    expect(parseScope({ apiKeyId: "key_1", userId: "u_1", junk: 2 })).toEqual({
      apiKeyId: "key_1",
      userId: "u_1",
    });
  });
});

describe("budgetApplies", () => {
  it("an org-wide budget applies to everything", () => {
    expect(budgetApplies({}, { apiKeyId: "key_1" })).toBe(true);
    expect(budgetApplies({}, {})).toBe(true);
  });

  it("an api-key budget applies only to that key", () => {
    expect(budgetApplies({ apiKeyId: "key_1" }, { apiKeyId: "key_1" })).toBe(true);
    expect(budgetApplies({ apiKeyId: "key_1" }, { apiKeyId: "key_2" })).toBe(false);
    expect(budgetApplies({ apiKeyId: "key_1" }, { apiKeyId: null })).toBe(false);
  });

  it("multiple constraints must all match", () => {
    const scope = { apiKeyId: "key_1", userId: "u_1" };
    expect(budgetApplies(scope, { apiKeyId: "key_1", userId: "u_1" })).toBe(true);
    expect(budgetApplies(scope, { apiKeyId: "key_1", userId: "u_2" })).toBe(false);
  });
});
