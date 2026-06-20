/**
 * Authorization primitives. These are the building blocks for the single
 * server-side authorization choke point that guards every mutation. Scopes use
 * a `resource:action` form and support `*` wildcards (e.g. `catalog:*` or the
 * super-scope `*`). Authorization is always **fail-closed**.
 */

import { Errors } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

/** A scope string in `resource:action` form (or a wildcard). */
export type Scope = string;

/** The authenticated actor making a request. */
export interface Principal {
  readonly id: string;
  readonly orgId: string;
  readonly kind: "user" | "agent" | "service";
  readonly scopes: readonly Scope[];
}

const SCOPE_RE = /^(\*|[a-z0-9_-]+:(?:\*|[a-z0-9_-]+))$/;

/** Validate a scope's shape. */
export function isValidScope(scope: string): boolean {
  return SCOPE_RE.test(scope);
}

/** Whether a granted scope satisfies a required scope, honoring wildcards. */
export function scopeSatisfies(granted: Scope, required: Scope): boolean {
  if (granted === "*" || granted === required) return true;
  const [grantedResource, grantedAction] = granted.split(":");
  const [requiredResource, requiredAction] = required.split(":");
  if (grantedResource !== requiredResource) return false;
  return grantedAction === "*" && requiredAction !== undefined;
}

/** Whether the principal holds at least one scope satisfying `required`. */
export function hasScope(principal: Principal, required: Scope): boolean {
  return principal.scopes.some((granted) => scopeSatisfies(granted, required));
}

/** Whether the principal satisfies every required scope. */
export function hasAllScopes(principal: Principal, required: readonly Scope[]): boolean {
  return required.every((scope) => hasScope(principal, scope));
}

/** The subset of required scopes the principal is missing. */
export function missingScopes(principal: Principal, required: readonly Scope[]): Scope[] {
  return required.filter((scope) => !hasScope(principal, scope));
}

/**
 * Authorize a principal against required scopes, returning a `Result`. The
 * error is a `FORBIDDEN` {@link AppError} listing the missing scopes (never the
 * granted ones).
 */
export function authorize(
  principal: Principal,
  required: Scope | readonly Scope[],
): Result<Principal, ReturnType<typeof Errors.forbidden>> {
  const scopes = Array.isArray(required) ? required : [required as Scope];
  const missing = missingScopes(principal, scopes);
  if (missing.length > 0) {
    return err(Errors.policyDenied("Insufficient scope", { missingScopes: missing }));
  }
  return ok(principal);
}

/**
 * Assert authorization, throwing the `AppError` on denial. Use at the start of
 * every mutation handler.
 */
export function requireScopes(principal: Principal, required: Scope | readonly Scope[]): void {
  const result = authorize(principal, required);
  if (!result.ok) throw result.error;
}

/**
 * Enforce tenant isolation: the principal may only act within its own org.
 * Throws `FORBIDDEN` on a cross-tenant attempt.
 */
export function requireSameOrg(principal: Principal, resourceOrgId: string): void {
  if (principal.orgId !== resourceOrgId) {
    throw Errors.forbidden("Cross-tenant access is not permitted");
  }
}
