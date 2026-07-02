import { describe, expect, it } from "vitest";

import { detectDuplicateTasks } from "@/server/swarms/task-dedup";

describe("detectDuplicateTasks", () => {
  it("returns empty array for a single task", () => {
    expect(detectDuplicateTasks(["Write a blog post"])).toEqual([]);
  });

  it("returns empty array for clearly distinct tasks", () => {
    const tasks = [
      "Research market trends in Southeast Asia",
      "Write Python unit tests for the auth module",
      "Design a new onboarding email sequence",
    ];
    expect(detectDuplicateTasks(tasks)).toEqual([]);
  });

  it("detects exact duplicates after normalisation", () => {
    const warnings = detectDuplicateTasks([
      "Write the announcement",
      "Write The Announcement", // same after lowercase + trim
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("exact");
    expect(warnings[0]?.similarity).toBe(1);
    expect(warnings[0]?.indexA).toBe(0);
    expect(warnings[0]?.indexB).toBe(1);
  });

  it("detects near-duplicate tasks (rephrased same content)", () => {
    // One verb changed ("Research" → "Analyze") across 10 total tokens → Jaccard ≈ 9/11 ≈ 0.82
    const warnings = detectDuplicateTasks([
      "Research the market trends for electric vehicles in North America in 2025",
      "Analyze the market trends for electric vehicles in North America in 2025",
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("near");
    expect(warnings[0]?.similarity).toBeGreaterThanOrEqual(0.8);
  });

  it("does NOT flag tasks with moderate overlap", () => {
    // These share some words but are clearly different tasks.
    const warnings = detectDuplicateTasks([
      "Summarise the research findings",
      "Summarise the financial report",
    ]);
    // Jaccard similarity will be < 0.8 because the distinguishing tokens differ.
    const nearDups = warnings.filter((w) => w.kind === "near");
    expect(nearDups).toHaveLength(0);
  });

  it("returns multiple warnings for multiple duplicate pairs", () => {
    const warnings = detectDuplicateTasks([
      "Task A",
      "Task A", // exact dup of 0
      "Task A", // exact dup of 0 and 1
    ]);
    // 3 pairs: (0,1), (0,2), (1,2)
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.every((w) => w.kind === "exact")).toBe(true);
  });

  it("sorts warnings by similarity descending (exact first)", () => {
    const warnings = detectDuplicateTasks([
      "Research market trends in Southeast Asia for 2025",
      "Research market trends in Southeast Asia for 2026", // near dup
      "Research market trends in Southeast Asia for 2025", // exact dup of 0
    ]);
    expect(warnings[0]?.similarity).toBe(1);
  });
});
