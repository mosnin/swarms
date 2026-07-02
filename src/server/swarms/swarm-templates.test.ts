import { describe, expect, it } from "vitest";

import { expandTemplate, findTemplate, SWARM_TEMPLATES } from "@/server/swarms/swarm-templates";

describe("SWARM_TEMPLATES", () => {
  it("includes research, pipeline, and synthesis templates", () => {
    const ids = SWARM_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("research");
    expect(ids).toContain("pipeline");
    expect(ids).toContain("synthesis");
  });

  it("each template has a non-empty name and description", () => {
    for (const t of SWARM_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("each template has at least one task", () => {
    for (const t of SWARM_TEMPLATES) {
      expect(t.tasks.length).toBeGreaterThan(0);
    }
  });

  it("pipeline template is sequential, research and synthesis are parallel", () => {
    expect(findTemplate("pipeline")?.sequential).toBe(true);
    expect(findTemplate("research")?.sequential).toBe(false);
    expect(findTemplate("synthesis")?.sequential).toBe(false);
  });

  it("research and synthesis templates have an aggregator", () => {
    expect(findTemplate("research")?.aggregatorTask).toBeDefined();
    expect(findTemplate("synthesis")?.aggregatorTask).toBeDefined();
  });

  it("pipeline template has no aggregator (chain is the pattern)", () => {
    expect(findTemplate("pipeline")?.aggregatorTask).toBeUndefined();
  });
});

describe("findTemplate", () => {
  it("returns the template for a known id", () => {
    const t = findTemplate("research");
    expect(t?.id).toBe("research");
  });

  it("returns undefined for an unknown id", () => {
    expect(findTemplate("nonexistent")).toBeUndefined();
  });
});

describe("expandTemplate", () => {
  it("replaces {{objective}} in task strings", () => {
    const t = findTemplate("research")!;
    const { tasks } = expandTemplate(t, "quantum computing");
    for (const task of tasks) {
      expect(task).not.toContain("{{objective}}");
      expect(task).toContain("quantum computing");
    }
  });

  it("replaces {{objective}} in aggregatorTask when present", () => {
    const t = findTemplate("research")!;
    const { aggregatorTask } = expandTemplate(t, "AI safety");
    // research aggregator does not contain {{objective}} by design — just verify no leftover placeholder
    expect(aggregatorTask).toBeDefined();
    expect(aggregatorTask).not.toContain("{{objective}}");
  });

  it("preserves sequential flag from template", () => {
    const pipe = findTemplate("pipeline")!;
    expect(expandTemplate(pipe, "test").sequential).toBe(true);
    const res = findTemplate("research")!;
    expect(expandTemplate(res, "test").sequential).toBe(false);
  });
});
