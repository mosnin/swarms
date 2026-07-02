/**
 * Authorization context and server-side guards. An {@link AuthContext} captures
 * the authenticated principal, its active organization, and its effective
 * permissions. Every mutation and every org-scoped read MUST pass through
 * {@link requirePermission} and {@link requireOrganization} — these are the
 * single choke point for access control. All guards fail closed.
 */

import { Errors } from "@/lib/errors";
import {
  permissionsForRole,
  sanitizePermissions,
  type HumanRole,
  type Permission,
  type Role,
} from "@/modules/identity/roles";

export type Actor =
  | { kind: "user"; userId: string; membershipId: string; role: HumanRole }
  | { kind: "agent"; apiKeyId: string | null; userId: string | null; role: "agent" };

export interface AuthContext {
  organizationId: string;
  actor: Actor;
  permissions: ReadonlySet<Permission>;
}

/** Build a context for an authenticated human member. */
export function userContext(params: {
  organizationId: string;
  userId: string;
  membershipId: string;
  role: HumanRole;
}): AuthContext {
  return {
    organizationId: params.organizationId,
    actor: {
      kind: "user",
      userId: params.userId,
      membershipId: params.membershipId,
      role: params.role,
    },
    permissions: permissionsForRole(params.role),
  };
}

/**
 * Build a context for an API-key (agent) principal. Effective permissions are
 * the key's explicit scopes (validated as a subset of the granting member at
 * creation); when a key has no explicit scopes it inherits the `agent` defaults.
 */
export function agentContext(params: {
  organizationId: string;
  apiKeyId: string | null;
  userId: string | null;
  scopes: readonly string[];
}): AuthContext {
  const scoped = sanitizePermissions(params.scopes);
  const permissions = scoped.length > 0 ? new Set<Permission>(scoped) : permissionsForRole("agent");
  return {
    organizationId: params.organizationId,
    actor: { kind: "agent", apiKeyId: params.apiKeyId, userId: params.userId, role: "agent" },
    permissions,
  };
}

export function roleOf(ctx: AuthContext): Role {
  return ctx.actor.role;
}

/** Non-throwing permission check. */
export function can(ctx: AuthContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/**
 * Assert the principal holds `permission`. Throws `FORBIDDEN` otherwise. Call at
 * the top of every mutation handler.
 */
export function requirePermission(ctx: AuthContext, permission: Permission): void {
  if (!ctx.permissions.has(permission)) {
    throw Errors.forbidden(`Missing required permission: ${permission}`);
  }
}

/** Assert the principal holds every listed permission. */
export function requireAllPermissions(ctx: AuthContext, permissions: readonly Permission[]): void {
  for (const permission of permissions) requirePermission(ctx, permission);
}

/**
 * Enforce tenant isolation: the resource's organization must match the
 * principal's active organization. Throws `FORBIDDEN` on any cross-tenant
 * access. Use on every org-scoped query/mutation.
 */
export function requireOrganization(ctx: AuthContext, resourceOrganizationId: string): void {
  if (ctx.organizationId !== resourceOrganizationId) {
    throw Errors.forbidden("Cross-tenant access is not permitted");
  }
}

/** Combined guard: permission + organization scope in one call. */
export function authorizeOrgAction(
  ctx: AuthContext,
  permission: Permission,
  resourceOrganizationId: string,
): void {
  requirePermission(ctx, permission);
  requireOrganization(ctx, resourceOrganizationId);
}

/**
 * Validate that requested API-key scopes are a subset of the granting
 * principal's own permissions (no privilege escalation). Throws `FORBIDDEN`.
 */
export function assertScopesGrantable(ctx: AuthContext, requested: readonly Permission[]): void {
  const excess = requested.filter((permission) => !ctx.permissions.has(permission));
  if (excess.length > 0) {
    throw Errors.forbidden("Cannot grant permissions you do not hold", { excess });
  }
}
