import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/v1/route";
import { CATALOG_VERSION } from "@/server/skills/skill-registry";

describe("GET /api/v1", () => {
  it("returns 200 without authentication", async () => {
    const req = new Request("http://localhost/api/v1");
    const res = await GET(req as never);
    expect(res.status).toBe(200);
  });

  it("returns application/json", async () => {
    const req = new Request("http://localhost/api/v1");
    const res = await GET(req as never);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("returns the current catalog version", async () => {
    const req = new Request("http://localhost/api/v1");
    const res = await GET(req as never);
    const body = await res.json() as { data: { catalogVersion: string } };
    expect(body.data.catalogVersion).toBe(CATALOG_VERSION);
  });

  it("includes links to all major API families", async () => {
    const req = new Request("http://localhost/api/v1");
    const res = await GET(req as never);
    const body = await res.json() as { data: { links: Record<string, string> } };
    const { links } = body.data;
    expect(links.skills).toBe("/api/v1/skills");
    expect(links.skillsManifest).toBe("/api/v1/skills/manifest");
    expect(links.swarms).toBe("/api/v1/swarms");
    expect(links.estimateSwarm).toBe("/api/v1/swarms/estimate");
    expect(links.spawn).toBe("/api/v1/spawn");
  });

  it("sets a public cache-control header", async () => {
    const req = new Request("http://localhost/api/v1");
    const res = await GET(req as never);
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toContain("public");
    expect(cc).toContain("max-age=60");
  });

  it("includes auth scheme instructions", async () => {
    const req = new Request("http://localhost/api/v1");
    const res = await GET(req as never);
    const body = await res.json() as { data: { auth: { scheme: string } } };
    expect(body.data.auth.scheme).toBe("bearer");
  });
});
