import { describe, expect, it } from "vitest";

import { evaluatePolicy, type PolicyRule } from "@/server/policy/evaluatePolicy";

function rule(overrides: Partial<PolicyRule>): PolicyRule {
  return {
    id: "pol_x",
    name: "rule",
    effect: "deny",
    priority: 0,
    enabled: true,
    conditions: {},
    ...overrides,
  };
}

describe("evaluatePolicy", () => {
  it("defaults to allow when no rule matches", () => {
    const decision = evaluatePolicy([], { costMinor: 100 });
    expect(decision.effect).toBe("allow");
    expect(decision.matchedRule).toBeNull();
  });

  it("denies when a matching deny rule applies", () => {
    const rules = [
      rule({ effect: "deny", name: "no-critical", conditions: { riskLevelAtLeast: "critical" } }),
    ];
    expect(evaluatePolicy(rules, { costMinor: 0, skillRiskLevel: "critical" }).effect).toBe("deny");
    expect(evaluatePolicy(rules, { costMinor: 0, skillRiskLevel: "low" }).effect).toBe("allow");
  });

  it("requires approval above a cost threshold", () => {
    const rules = [
      rule({ effect: "require_approval", name: "big-spend", conditions: { costAtLeastMinor: 1000 } }),
    ];
    expect(evaluatePolicy(rules, { costMinor: 1500 }).effect).toBe("require_approval");
    expect(evaluatePolicy(rules, { costMinor: 500 }).effect).toBe("allow");
  });

  it("ignores disabled rules", () => {
    const rules = [rule({ effect: "deny", enabled: false, conditions: { costAtLeastMinor: 0 } })];
    expect(evaluatePolicy(rules, { costMinor: 100 }).effect).toBe("allow");
  });

  it("highest priority wins; ties break toward the stricter effect", () => {
    const rules = [
      rule({ id: "a", effect: "allow", priority: 5, conditions: { costAtLeastMinor: 0 } }),
      rule({ id: "b", effect: "deny", priority: 5, conditions: { costAtLeastMinor: 0 } }),
      rule({ id: "c", effect: "require_approval", priority: 10, conditions: { costAtLeastMinor: 0 } }),
    ];
    // priority 10 (require_approval) beats the priority-5 pair.
    expect(evaluatePolicy(rules, { costMinor: 100 }).effect).toBe("require_approval");
  });

  it("matches boolean conditions like requiresExternalWrite", () => {
    const rules = [
      rule({ effect: "require_approval", conditions: { requiresExternalWrite: true } }),
    ];
    expect(evaluatePolicy(rules, { costMinor: 0, requiresExternalWrite: true }).effect).toBe(
      "require_approval",
    );
    expect(evaluatePolicy(rules, { costMinor: 0, requiresExternalWrite: false }).effect).toBe("allow");
  });

  it("matches connector + operation equality", () => {
    const rules = [
      rule({ effect: "deny", conditions: { connectorName: "gmail", operationType: "send" } }),
    ];
    expect(
      evaluatePolicy(rules, { costMinor: 0, connectorName: "gmail", operationType: "send" }).effect,
    ).toBe("deny");
    expect(
      evaluatePolicy(rules, { costMinor: 0, connectorName: "gmail", operationType: "read" }).effect,
    ).toBe("allow");
  });
});
