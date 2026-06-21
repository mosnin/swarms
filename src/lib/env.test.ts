import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

const validSource = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/swarms",
};

describe("parseEnv", () => {
  it("parses a valid environment and applies defaults", () => {
    const env = parseEnv(validSource);
    expect(env.DATABASE_URL).toBe(validSource.DATABASE_URL);
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.PORT).toBe(3000);
    expect(env.APP_BASE_URL).toBe("http://localhost:3000");
  });

  it("fails fast when a required variable is missing", () => {
    expect(() => parseEnv({})).toThrowError(/Invalid environment configuration/);
    expect(() => parseEnv({})).toThrowError(/DATABASE_URL/);
  });

  it("rejects a malformed DATABASE_URL", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://localhost/db" })).toThrowError(/postgres/);
  });

  it("coerces and validates PORT", () => {
    expect(parseEnv({ ...validSource, PORT: "8080" }).PORT).toBe(8080);
    expect(() => parseEnv({ ...validSource, PORT: "not-a-number" })).toThrowError();
    expect(() => parseEnv({ ...validSource, PORT: "70000" })).toThrowError();
  });

  it("rejects an invalid LOG_LEVEL", () => {
    expect(() => parseEnv({ ...validSource, LOG_LEVEL: "verbose" })).toThrowError(/LOG_LEVEL/);
  });
});
