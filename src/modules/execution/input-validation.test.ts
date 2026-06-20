import { describe, expect, it } from "vitest";

import { assertValidInput, collectInputIssues } from "@/modules/execution/input-validation";

const schema = {
  type: "object",
  required: ["url"],
  properties: {
    url: { type: "string" },
    depth: { type: "integer" },
    flag: { type: "boolean" },
  },
};

describe("collectInputIssues", () => {
  it("accepts conforming input", () => {
    expect(collectInputIssues({ url: "https://x.com", depth: 2, flag: true }, schema)).toEqual([]);
  });

  it("flags a missing required field", () => {
    expect(collectInputIssues({ depth: 1 }, schema)).toContain("missing required field: url");
  });

  it("flags a wrong top-level type", () => {
    expect(collectInputIssues("not-an-object", schema)).toContain("input must be of type object");
  });

  it("flags a wrong property type", () => {
    const issues = collectInputIssues({ url: "ok", depth: 1.5 }, schema);
    expect(issues).toContain('field "depth" must be of type integer');
  });

  it("ignores unknown extra properties", () => {
    expect(collectInputIssues({ url: "ok", extra: 123 }, schema)).toEqual([]);
  });

  it("treats an empty/absent schema as permissive", () => {
    expect(collectInputIssues({ anything: true }, {})).toEqual([]);
    expect(collectInputIssues(42, undefined)).toEqual([]);
  });
});

describe("assertValidInput", () => {
  it("throws a VALIDATION AppError with issues", () => {
    try {
      assertValidInput({}, schema);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("VALIDATION");
      expect((err as { details?: { issues?: string[] } }).details?.issues).toContain(
        "missing required field: url",
      );
    }
  });

  it("does not throw for valid input", () => {
    expect(() => assertValidInput({ url: "https://x.com" }, schema)).not.toThrow();
  });
});
