/**
 * Validates the skill registry is internally consistent:
 *  - catalog version is a valid semver string
 *  - every skill has required fields and a callable tool definition
 *  - every skill's relatedSkills references real skill ids
 *  - buildManifest() is a strict subset of the full catalog
 */

import { describe, expect, it } from "vitest";

import { buildManifest, CATALOG_VERSION, SKILL_CATALOG } from "@/server/skills/skill-registry";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

describe("skill registry", () => {
  it("catalogVersion is valid semver", () => {
    expect(CATALOG_VERSION).toMatch(SEMVER_RE);
  });

  it("has at least the core skills", () => {
    const ids = SKILL_CATALOG.skills.map((s) => s.id);
    for (const required of ["spawn-swarm", "spawn-agent", "get-job", "cancel-job"]) {
      expect(ids, `missing skill: ${required}`).toContain(required);
    }
  });

  it("every skill has required top-level fields", () => {
    for (const skill of SKILL_CATALOG.skills) {
      expect(skill.id, "missing id").toBeTruthy();
      expect(skill.version, `${skill.id}: missing version`).toMatch(SEMVER_RE);
      expect(skill.name, `${skill.id}: missing name`).toBeTruthy();
      expect(skill.description, `${skill.id}: missing description`).toBeTruthy();
      expect(skill.endpoint, `${skill.id}: missing endpoint`).toMatch(/^\//);
      expect(["GET", "POST", "DELETE"], `${skill.id}: invalid method`).toContain(skill.method);
      expect(skill.auth, `${skill.id}: auth must be bearer`).toBe("bearer");
      expect(skill.examples, `${skill.id}: must have examples`).not.toHaveLength(0);
      expect(skill.output, `${skill.id}: missing output schema`).toBeDefined();
    }
  });

  it("every skill has a valid OpenAI tool definition", () => {
    for (const skill of SKILL_CATALOG.skills) {
      expect(skill.tool.type, `${skill.id}: tool.type must be function`).toBe("function");
      expect(skill.tool.function.name, `${skill.id}: tool.function.name missing`).toBeTruthy();
      expect(skill.tool.function.description, `${skill.id}: tool.function.description missing`).toBeTruthy();
      expect(skill.tool.function.parameters.type, `${skill.id}: parameters.type missing`).toBe("object");
    }
  });

  it("every curl example contains $SWARMS_URL", () => {
    for (const skill of SKILL_CATALOG.skills) {
      for (const ex of skill.examples) {
        expect(ex.curl, `${skill.id} example "${ex.title}": curl must use $SWARMS_URL`).toContain("$SWARMS_URL");
      }
    }
  });

  it("relatedSkills reference existing skill ids", () => {
    const ids = new Set(SKILL_CATALOG.skills.map((s) => s.id));
    for (const skill of SKILL_CATALOG.skills) {
      for (const rel of skill.relatedSkills ?? []) {
        expect(ids, `${skill.id}: relatedSkill "${rel}" not found`).toContain(rel);
      }
    }
  });

  it("no duplicate skill ids", () => {
    const ids = SKILL_CATALOG.skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("buildManifest", () => {
    it("catalogVersion matches", () => {
      expect(buildManifest().catalogVersion).toBe(CATALOG_VERSION);
    });

    it("manifest has one entry per skill with id, version, name, endpoint, method", () => {
      const manifest = buildManifest();
      expect(manifest.skills).toHaveLength(SKILL_CATALOG.skills.length);
      for (const entry of manifest.skills) {
        expect(entry.id).toBeTruthy();
        expect(entry.version).toMatch(SEMVER_RE);
        expect(entry.name).toBeTruthy();
        expect(entry.endpoint).toMatch(/^\//);
        expect(["GET", "POST", "DELETE"]).toContain(entry.method);
      }
    });

    it("manifest does NOT include schemas or examples (compact)", () => {
      const manifest = buildManifest();
      for (const entry of manifest.skills) {
        expect(Object.keys(entry)).not.toContain("input");
        expect(Object.keys(entry)).not.toContain("output");
        expect(Object.keys(entry)).not.toContain("examples");
        expect(Object.keys(entry)).not.toContain("tool");
      }
    });
  });
});
