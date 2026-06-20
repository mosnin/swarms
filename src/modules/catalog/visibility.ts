/**
 * Skill visibility rules — the single source of truth for who may see a skill.
 *
 * - `private`  : only the owning organization.
 * - `unlisted` : the owning org plus anyone with a direct reference (resolvable
 *                by id/slug) but never surfaced in discovery listings.
 * - `public`   : visible to every authenticated organization, listed in search.
 *
 * These are pure functions so the rules can be unit-tested exhaustively and
 * reused by both the API service layer and the dashboard.
 */

export type SkillVisibility = "private" | "unlisted" | "public";

export interface ViewableSkill {
  organizationId: string;
  visibility: SkillVisibility;
}

/** Whether a viewer in `viewerOrgId` may read this skill's detail. */
export function canViewSkill(viewerOrgId: string, skill: ViewableSkill): boolean {
  if (skill.organizationId === viewerOrgId) return true;
  return skill.visibility === "public" || skill.visibility === "unlisted";
}

/** Whether this skill should appear in discovery listings for the viewer. */
export function isListedFor(viewerOrgId: string, skill: ViewableSkill): boolean {
  if (skill.organizationId === viewerOrgId) return true;
  return skill.visibility === "public";
}

/** Filter a list of skills to those a viewer may read (detail-level access). */
export function filterViewable<T extends ViewableSkill>(viewerOrgId: string, skills: T[]): T[] {
  return skills.filter((skill) => canViewSkill(viewerOrgId, skill));
}

/** Filter a list of skills to those that should appear in discovery listings. */
export function filterListed<T extends ViewableSkill>(viewerOrgId: string, skills: T[]): T[] {
  return skills.filter((skill) => isListedFor(viewerOrgId, skill));
}
