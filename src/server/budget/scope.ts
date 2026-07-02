/**
 * Budget scoping. A budget's `scope` (JSONB) narrows which requests it applies
 * to. An empty/absent scope is organization-wide. Present constraints must all
 * match the request context for the budget to apply. Pure + testable; the spend
 * computation for a matched scope lives in `ledgerQueries.ts`.
 */

export interface BudgetScope {
  /** Restrict to a specific API key principal. */
  apiKeyId?: string;
  /** Restrict to a specific human user. */
  userId?: string;
}

export interface BudgetContext {
  apiKeyId?: string | null;
  userId?: string | null;
}

/** Parse an untrusted JSONB scope into a typed {@link BudgetScope}. */
export function parseScope(raw: unknown): BudgetScope {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const scope: BudgetScope = {};
  if (typeof r.apiKeyId === "string") scope.apiKeyId = r.apiKeyId;
  if (typeof r.userId === "string") scope.userId = r.userId;
  return scope;
}

/** Whether a budget with `scope` applies to a request with `context`. */
export function budgetApplies(scope: BudgetScope, context: BudgetContext): boolean {
  if (scope.apiKeyId !== undefined && scope.apiKeyId !== context.apiKeyId) return false;
  if (scope.userId !== undefined && scope.userId !== context.userId) return false;
  return true;
}

/** True when the scope carries at least one constraint (i.e. not org-wide). */
export function isScoped(scope: BudgetScope): boolean {
  return scope.apiKeyId !== undefined || scope.userId !== undefined;
}
