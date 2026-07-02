/**
 * Validates that openapi.json is well-formed and documents the real v1 routes,
 * so the spec cannot silently drift from the implementation.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const specPath = fileURLToPath(new URL("../../openapi.json", import.meta.url));
const spec = JSON.parse(readFileSync(specPath, "utf8")) as {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
};

describe("openapi.json", () => {
  it("is a valid OpenAPI 3.x document with info + paths", () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe("Swarms API");
    expect(Object.keys(spec.paths).length).toBeGreaterThan(5);
  });

  it("documents the core agent + swarm + connector endpoints", () => {
    for (const path of [
      "/api/v1/spawn",
      "/api/v1/swarms",
      "/api/v1/jobs/{jobId}",
      "/api/v1/jobs/{jobId}/logs",
      "/api/v1/jobs/{jobId}/cancel",
      "/api/v1/connectors/call",
      "/api/health",
    ]) {
      expect(spec.paths[path], `missing path ${path}`).toBeDefined();
    }
  });

  it("defines bearer auth and the request/response schemas", () => {
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(spec.components.schemas.SpawnRequest).toBeDefined();
    expect(spec.components.schemas.SwarmSpawnRequest).toBeDefined();
    expect(spec.components.schemas.Error).toBeDefined();
  });

  it("every path has at least one operation with responses", () => {
    for (const [path, ops] of Object.entries(spec.paths)) {
      const methods = Object.values(ops) as Array<{ responses?: Record<string, unknown> }>;
      expect(methods.length, `${path} has no operations`).toBeGreaterThan(0);
      for (const op of methods) {
        expect(op.responses, `${path} operation missing responses`).toBeDefined();
      }
    }
  });
});
