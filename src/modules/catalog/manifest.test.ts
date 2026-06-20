import { describe, expect, it } from "vitest";

import { computeChecksum, parseManifest, type SkillManifest } from "@/modules/catalog/manifest";

function validManifest(overrides: Partial<SkillManifest> = {}): Record<string, unknown> {
  return {
    name: "Web Summarizer",
    version: "1.0.0",
    description: "Summarizes a web page",
    inputSchema: { type: "object", properties: { url: { type: "string" } } },
    outputSchema: { type: "object", properties: { summary: { type: "string" } } },
    permissions: ["skills.execute"],
    riskLevel: "low",
    estimatedCostMinor: 200,
    estimatedDurationMs: 1500,
    maxRuntimeMs: 30000,
    supportsParallelism: false,
    ...overrides,
  };
}

describe("parseManifest", () => {
  it("accepts a well-formed manifest", () => {
    const manifest = parseManifest(validManifest());
    expect(manifest.name).toBe("Web Summarizer");
    expect(manifest.riskLevel).toBe("low");
  });

  it("defaults description and permissions when omitted", () => {
    const input = validManifest();
    delete (input as Record<string, unknown>).description;
    delete (input as Record<string, unknown>).permissions;
    const manifest = parseManifest(input);
    expect(manifest.description).toBe("");
    expect(manifest.permissions).toEqual([]);
  });

  it("rejects an invalid semver version", () => {
    expect(() => parseManifest(validManifest({ version: "v1" }))).toThrowError(/manifest/i);
  });

  it("rejects an unknown risk level", () => {
    expect(() =>
      parseManifest(validManifest({ riskLevel: "nuclear" as never })),
    ).toThrowError(/manifest/i);
  });

  it("rejects a non-positive maxRuntimeMs", () => {
    expect(() => parseManifest(validManifest({ maxRuntimeMs: 0 }))).toThrowError(/manifest/i);
  });

  it("rejects floating-point cost (must be integer minor units)", () => {
    expect(() => parseManifest(validManifest({ estimatedCostMinor: 1.5 }))).toThrowError(/manifest/i);
  });

  it("rejects unknown extra keys (strict)", () => {
    expect(() => parseManifest(validManifest({ extra: true } as never))).toThrowError(/manifest/i);
  });

  it("surfaces structured issues in the AppError details", () => {
    try {
      parseManifest(validManifest({ version: "bad" }));
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("VALIDATION");
      expect((err as { details?: { issues?: string[] } }).details?.issues?.[0]).toMatch(/version/);
    }
  });
});

describe("computeChecksum", () => {
  const base = {
    manifest: { a: 1, b: 2 },
    inputSchema: { type: "object" },
    outputSchema: { type: "string" },
    runnerType: "mock" as const,
  };

  it("is deterministic for identical content", () => {
    expect(computeChecksum(base)).toBe(computeChecksum(base));
  });

  it("is order-independent over object keys", () => {
    const reordered = {
      ...base,
      manifest: { b: 2, a: 1 },
    };
    expect(computeChecksum(reordered)).toBe(computeChecksum(base));
  });

  it("changes when content changes", () => {
    const changed = { ...base, manifest: { a: 1, b: 3 } };
    expect(computeChecksum(changed)).not.toBe(computeChecksum(base));
  });

  it("distinguishes runner type", () => {
    expect(computeChecksum({ ...base, runnerType: "http" })).not.toBe(computeChecksum(base));
  });
});
