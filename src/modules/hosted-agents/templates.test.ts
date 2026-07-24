/**
 * Unit: the agent-template catalog. Every template must be a valid, deployable
 * preset — unique slug, within the same bounds createAgentInstance enforces.
 */

import { describe, expect, it } from "vitest";

import { AGENT_TEMPLATES, templateBySlug } from "@/modules/hosted-agents/templates";

describe("agent templates", () => {
  it("has unique slugs", () => {
    const slugs = AGENT_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every template is within createAgentInstance bounds", () => {
    for (const t of AGENT_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.name.length).toBeLessThanOrEqual(120);
      expect(t.instructions.length).toBeGreaterThan(0);
      expect(t.instructions.length).toBeLessThanOrEqual(8_000);
      expect(Number.isInteger(t.budgetMinorPerWake)).toBe(true);
      expect(t.budgetMinorPerWake).toBeGreaterThan(0);
      expect(t.budgetMinorPerWake).toBeLessThanOrEqual(1_000_000);
      if (t.wakeIntervalMinutes !== null) {
        expect(t.wakeIntervalMinutes).toBeGreaterThanOrEqual(5);
        expect(t.wakeIntervalMinutes).toBeLessThanOrEqual(24 * 60);
      }
    }
  });

  it("resolves a template by slug", () => {
    expect(templateBySlug("inbox-concierge")?.name).toBe("Inbox Concierge");
    expect(templateBySlug("nope")).toBeUndefined();
  });
});
