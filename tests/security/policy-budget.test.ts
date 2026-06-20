/**
 * Security: policy denial and budget hard-stops must fail closed and not be
 * bypassable. These cover the decision cores the execution path enforces.
 */

import { describe, expect, it } from "vitest";

import { evaluatePolicy, type PolicyRule } from "@/server/policy/evaluatePolicy";
import { wouldExceed, type BudgetLedgerEntry } from "@/server/budget/budgetMath";

describe("policy denial fails closed", () => {
  const denyHighRisk: PolicyRule = {
    id: "p1",
    name: "deny-critical",
    effect: "deny",
    priority: 100,
    enabled: true,
    conditions: { riskLevelAtLeast: "high" },
  };

  it("denies a high-risk action regardless of other allow rules", () => {
    const allowAll: PolicyRule = {
      id: "p2",
      name: "allow",
      effect: "allow",
      priority: 1,
      enabled: true,
      conditions: {},
    };
    const decision = evaluatePolicy([allowAll, denyHighRisk], {
      costMinor: 0,
      skillRiskLevel: "critical",
    });
    expect(decision.effect).toBe("deny");
  });

  it("requires approval above a cost ceiling", () => {
    const approve: PolicyRule = {
      id: "p3",
      name: "approve-expensive",
      effect: "require_approval",
      priority: 10,
      enabled: true,
      conditions: { costAtLeastMinor: 1000 },
    };
    expect(evaluatePolicy([approve], { costMinor: 5000 }).effect).toBe("require_approval");
  });
});

describe("budget overage fails closed", () => {
  const charge = (n: number): BudgetLedgerEntry => ({ direction: "debit", kind: "charge", amountMinor: n });
  const hold = (n: number): BudgetLedgerEntry => ({ direction: "debit", kind: "hold", amountMinor: n });

  it("blocks a charge that would exceed the limit", () => {
    expect(wouldExceed(1000, [charge(900)], 200)).toBe(true);
  });

  it("counts outstanding reservations against the limit", () => {
    // 700 committed + 250 reserved = 950; a 100 charge would exceed 1000.
    expect(wouldExceed(1000, [charge(700), hold(250)], 100)).toBe(true);
  });

  it("allows a charge within the remaining headroom", () => {
    expect(wouldExceed(1000, [charge(500)], 200)).toBe(false);
  });
});
