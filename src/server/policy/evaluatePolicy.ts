/**
 * Policy evaluation engine. Given a set of organization policy rules and the
 * facts about a requested action, decides whether it is allowed, denied, or
 * requires human approval. Pure and deterministic so it can be exhaustively
 * unit-tested; the execution flow consults it before creating/enqueuing a job.
 *
 * Resolution: among enabled rules whose conditions match, the highest-priority
 * rule wins; ties break by severity (deny > require_approval > allow). When no
 * rule matches, the default is allow (deny-by-rule, not deny-by-default — the
 * platform is permissive unless an org opts into restrictions).
 */

export type PolicyEffect = "allow" | "deny" | "require_approval";
export type RiskLevel = "low" | "medium" | "high" | "critical";

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const SEVERITY: Record<PolicyEffect, number> = { allow: 0, require_approval: 1, deny: 2 };

/** Facts about the action being evaluated. */
export interface PolicyRequest {
  skillRiskLevel?: RiskLevel;
  costMinor: number;
  connectorName?: string;
  operationType?: string;
  apiKeyId?: string | null;
  walletId?: string | null;
  swarmSize?: number;
  requiresExternalWrite?: boolean;
  requiresEmailSend?: boolean;
  requiresPayment?: boolean;
}

/** Conditions under which a rule applies. All present fields must match. */
export interface PolicyConditions {
  riskLevelAtLeast?: RiskLevel;
  costAtLeastMinor?: number;
  connectorName?: string;
  operationType?: string;
  apiKeyId?: string;
  walletId?: string;
  swarmSizeAtLeast?: number;
  requiresExternalWrite?: boolean;
  requiresEmailSend?: boolean;
  requiresPayment?: boolean;
}

export interface PolicyRule {
  id: string;
  name: string;
  effect: PolicyEffect;
  priority: number;
  enabled: boolean;
  conditions: PolicyConditions;
}

export interface PolicyDecision {
  effect: PolicyEffect;
  matchedRule: PolicyRule | null;
  reason: string;
}

function ruleMatches(rule: PolicyRule, req: PolicyRequest): boolean {
  const c = rule.conditions ?? {};

  if (c.riskLevelAtLeast !== undefined) {
    const reqRisk = req.skillRiskLevel ? RISK_ORDER[req.skillRiskLevel] : -1;
    if (reqRisk < RISK_ORDER[c.riskLevelAtLeast]) return false;
  }
  if (c.costAtLeastMinor !== undefined && req.costMinor < c.costAtLeastMinor) return false;
  if (c.connectorName !== undefined && req.connectorName !== c.connectorName) return false;
  if (c.operationType !== undefined && req.operationType !== c.operationType) return false;
  if (c.apiKeyId !== undefined && req.apiKeyId !== c.apiKeyId) return false;
  if (c.walletId !== undefined && req.walletId !== c.walletId) return false;
  if (c.swarmSizeAtLeast !== undefined && (req.swarmSize ?? 0) < c.swarmSizeAtLeast) return false;
  if (c.requiresExternalWrite === true && req.requiresExternalWrite !== true) return false;
  if (c.requiresEmailSend === true && req.requiresEmailSend !== true) return false;
  if (c.requiresPayment === true && req.requiresPayment !== true) return false;

  return true;
}

/** Evaluate `request` against `rules`, returning the winning decision. */
export function evaluatePolicy(rules: readonly PolicyRule[], request: PolicyRequest): PolicyDecision {
  const matching = rules.filter((r) => r.enabled && ruleMatches(r, request));
  if (matching.length === 0) {
    return { effect: "allow", matchedRule: null, reason: "No matching policy rule; default allow" };
  }

  matching.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return SEVERITY[b.effect] - SEVERITY[a.effect];
  });
  const winner = matching[0]!;
  return {
    effect: winner.effect,
    matchedRule: winner,
    reason: `Matched policy "${winner.name}" (${winner.effect})`,
  };
}
