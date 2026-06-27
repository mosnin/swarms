/**
 * HTTP-level tests for swarm template routes (#18):
 *
 *   GET  /api/v1/swarms/templates           — list all templates
 *   GET  /api/v1/swarms/templates/:id       — single template
 *   POST /api/v1/swarms/templates/:id/preview — expand with objective
 */

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { SWARM_TEMPLATES } from "@/server/swarms/swarm-templates";
import { GET as listTemplates } from "@/app/api/v1/swarms/templates/route";
import { GET as getTemplate } from "@/app/api/v1/swarms/templates/[templateId]/route";
import { POST as previewTemplate } from "@/app/api/v1/swarms/templates/[templateId]/preview/route";

function makeGetReq(path: string, params: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://test.local${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function makePostReq(path: string, body: unknown = {}): NextRequest {
  return new NextRequest(`http://test.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/swarms/templates", () => {
  it("returns JSON array of all templates", async () => {
    const res = await listTemplates(makeGetReq("/api/v1/swarms/templates"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json() as { templates: Array<{ id: string }> };
    expect(body.templates).toHaveLength(SWARM_TEMPLATES.length);
    expect(body.templates.map((t) => t.id)).toEqual(SWARM_TEMPLATES.map((t) => t.id));
  });

  it("returns Markdown when ?format=markdown", async () => {
    const res = await listTemplates(makeGetReq("/api/v1/swarms/templates", { format: "markdown" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("research");
  });

  it("includes Cache-Control header", async () => {
    const res = await listTemplates(makeGetReq("/api/v1/swarms/templates"));
    expect(res.headers.get("cache-control")).toBeTruthy();
  });

  it("each template has id, name, description, tasks, and sequential", async () => {
    const res = await listTemplates(makeGetReq("/api/v1/swarms/templates"));
    const body = await res.json() as { templates: Array<Record<string, unknown>> };
    for (const t of body.templates) {
      expect(typeof t["id"]).toBe("string");
      expect(typeof t["name"]).toBe("string");
      expect(typeof t["description"]).toBe("string");
      expect(Array.isArray(t["tasks"])).toBe(true);
      expect(typeof t["sequential"]).toBe("boolean");
    }
  });
});

describe("GET /api/v1/swarms/templates/:templateId", () => {
  it("returns a known template", async () => {
    const req = makeGetReq("/api/v1/swarms/templates/research");
    const res = await getTemplate(req, { params: Promise.resolve({ templateId: "research" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { template: { id: string; sequential: boolean } };
    expect(body.template.id).toBe("research");
    expect(body.template.sequential).toBe(false);
  });

  it("returns pipeline template with sequential=true", async () => {
    const req = makeGetReq("/api/v1/swarms/templates/pipeline");
    const res = await getTemplate(req, { params: Promise.resolve({ templateId: "pipeline" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { template: { sequential: boolean } };
    expect(body.template.sequential).toBe(true);
  });

  it("returns 404 for an unknown template id", async () => {
    const req = makeGetReq("/api/v1/swarms/templates/bogus");
    const res = await getTemplate(req, { params: Promise.resolve({ templateId: "bogus" }) });
    expect(res.status).toBe(404);
  });

  it("returns Markdown when ?format=markdown", async () => {
    const req = makeGetReq("/api/v1/swarms/templates/synthesis", { format: "markdown" });
    const res = await getTemplate(req, { params: Promise.resolve({ templateId: "synthesis" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
  });
});

describe("POST /api/v1/swarms/templates/:templateId/preview", () => {
  it("expands research template with objective", async () => {
    const req = makePostReq("/api/v1/swarms/templates/research/preview", {
      objective: "quantum computing",
    });
    const res = await previewTemplate(req, {
      params: Promise.resolve({ templateId: "research" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: {
        templateId: string;
        workerCount: number;
        sequential: boolean;
        tasks: string[];
        aggregatorTask: string | null;
        objective: string;
      };
    };
    expect(body.data.templateId).toBe("research");
    expect(body.data.objective).toBe("quantum computing");
    expect(body.data.sequential).toBe(false);
    expect(body.data.workerCount).toBe(4);
    expect(body.data.tasks.every((t) => t.includes("quantum computing"))).toBe(true);
    expect(body.data.tasks.every((t) => !t.includes("{{objective}}"))).toBe(true);
    expect(body.data.aggregatorTask).not.toBeNull();
  });

  it("expands pipeline template with sequential=true", async () => {
    const req = makePostReq("/api/v1/swarms/templates/pipeline/preview", {
      objective: "climate change",
    });
    const res = await previewTemplate(req, {
      params: Promise.resolve({ templateId: "pipeline" }),
    });
    const body = await res.json() as { data: { sequential: boolean; aggregatorTask: null } };
    expect(body.data.sequential).toBe(true);
    expect(body.data.aggregatorTask).toBeNull();
  });

  it("works with empty objective (default)", async () => {
    const req = makePostReq("/api/v1/swarms/templates/synthesis/preview", {});
    const res = await previewTemplate(req, {
      params: Promise.resolve({ templateId: "synthesis" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { tasks: string[] } };
    expect(body.data.tasks.length).toBeGreaterThan(0);
  });

  it("returns 404 for an unknown template id", async () => {
    const req = makePostReq("/api/v1/swarms/templates/nonexistent/preview", {
      objective: "test",
    });
    const res = await previewTemplate(req, {
      params: Promise.resolve({ templateId: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when objective exceeds max length", async () => {
    const req = makePostReq("/api/v1/swarms/templates/research/preview", {
      objective: "x".repeat(2001),
    });
    const res = await previewTemplate(req, {
      params: Promise.resolve({ templateId: "research" }),
    });
    expect(res.status).toBe(400);
  });
});
