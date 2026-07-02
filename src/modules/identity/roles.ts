/**
 * Role-based access control definitions. There are two principal kinds on the
 * platform: human members (with an organization role) and agents (API keys).
 * Permissions are coarse `resource.action` capabilities; roles are bundles of
 * permissions. Authorization is always evaluated against permissions, never
 * roles directly, so the mapping here is the single source of truth.
 */

export const PERMISSIONS = [
  "org.read",
  "org.manage",
  "api_keys.manage",
  "connectors.read",
  "connectors.manage",
  "jobs.read",
  "jobs.create",
  "jobs.cancel",
  "billing.read",
  "billing.manage",
  "policies.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && PERMISSION_SET.has(value);
}

/** Human organization roles (stored in `organization_members.role`). */
export const HUMAN_ROLES = ["owner", "admin", "developer", "operator", "viewer"] as const;
export type HumanRole = (typeof HUMAN_ROLES)[number];

/** The agent role is implicit for API-key principals (not a membership role). */
export type Role = HumanRole | "agent";

const ALL: readonly Permission[] = PERMISSIONS;

/**
 * Role → permissions matrix.
 * - owner: everything.
 * - admin: everything except `billing.manage` (financial control stays with owner).
 * - developer: build & run capabilities, manage own API keys; no governance/billing writes.
 * - operator: run/operate jobs and read state.
 * - viewer: read-only.
 * - agent: spawn work and manage its own jobs (default for keys with no explicit
 *   scopes).
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== "billing.manage"),
  developer: [
    "org.read",
    "api_keys.manage",
    "connectors.read",
    "connectors.manage",
    "jobs.read",
    "jobs.create",
    "jobs.cancel",
    "billing.read",
  ],
  operator: [
    "org.read",
    "connectors.read",
    "jobs.read",
    "jobs.create",
    "jobs.cancel",
    "billing.read",
    "audit.read",
  ],
  viewer: ["org.read", "connectors.read", "jobs.read", "billing.read", "audit.read"],
  agent: ["connectors.read", "jobs.read", "jobs.create", "jobs.cancel"],
};

/** The permission set granted by a role. */
export function permissionsForRole(role: Role): Set<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Keep only valid permissions from an arbitrary list (e.g. API-key scopes). */
export function sanitizePermissions(values: readonly string[]): Permission[] {
  return values.filter(isPermission);
}
