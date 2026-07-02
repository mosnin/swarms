/**
 * Tests for ?format=markdown support on main GET responses (#7).
 *
 * GET /api/v1              — root discovery
 * GET /api/v1/swarms       — list runs
 * GET /api/v1/swarms/:id   — single run
 * GET /api/v1/usage        — cost dashboard
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { createTestDb, seedOrg, type TestDb } from "../integration/harness";
import { GET as rootGet } from "@/app/api/v1/route";
import { GET as swarmsGet } from "@/app/api/v1/swarms/route";
import { GET as usageGet } from "@/app/api/v1/usage/route";

function makeReq(path: string, userId?: string, extraParams: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://test.local${path}`);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (userId) headers[SESSION_USER_HEADER] = userId;
  return new NextRequest(url, { headers });
}

describe("?format=markdown on GET endpoints", () => {
  let db: TestDb;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });

  afterEach(() => {
    __setTestDb(undefined);
  });

  // ── GET /api/v1 ────────────────────────────────────────────────────────────

  it("GET /api/v1 returns JSON by default", async () => {
    const res = rootGet(makeReq("/api/v1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json() as { data: { api: string } };
    expect(body.data.api).toBe("swarms");
  });

  it("GET /api/v1?format=markdown returns text/markdown", async () => {
    const res = rootGet(makeReq("/api/v1", undefined, { format: "markdown" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("swarms");
    expect(text).toContain("**api**");
  });

  it("GET /api/v1?format=markdown includes Cache-Control", async () => {
    const res = rootGet(makeReq("/api/v1", undefined, { format: "markdown" }));
    expect(res.headers.get("cache-control")).toContain("max-age=60");
  });

  // ── GET /api/v1/swarms ─────────────────────────────────────────────────────

  it("GET /api/v1/swarms returns JSON by default", async () => {
    const { userId } = await seedOrg(db, "org-fmt-1");
    const res = await swarmsGet(makeReq("/api/v1/swarms", userId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("GET /api/v1/swarms?format=markdown returns text/markdown", async () => {
    const { userId } = await seedOrg(db, "org-fmt-2");
    const res = await swarmsGet(makeReq("/api/v1/swarms", userId, { format: "markdown" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    // List response: empty list renders as "_empty list_" or a list marker
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("GET /api/v1/swarms?format=markdown with runs returns markdown with run data", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-fmt-3");
    // Insert a swarm run directly
    await db.insert(schema.swarmRuns).values({
      organizationId,
      idempotencyKey: "fmt-test-key",
      status: "succeeded",
      input: { workerCount: 1, model: "gpt-4", sequential: false },
      costCurrency: "USD",
      startedAt: new Date(),
      finishedAt: new Date(),
    });

    const res = await swarmsGet(makeReq("/api/v1/swarms", userId, { format: "markdown" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("succeeded");
  });

  // ── GET /api/v1/usage ──────────────────────────────────────────────────────

  it("GET /api/v1/usage returns JSON by default", async () => {
    const { userId } = await seedOrg(db, "org-fmt-4");
    const res = await usageGet(makeReq("/api/v1/usage", userId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("GET /api/v1/usage?format=markdown returns text/markdown", async () => {
    const { userId } = await seedOrg(db, "org-fmt-5");
    const res = await usageGet(makeReq("/api/v1/usage", userId, { format: "markdown" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("**periods**");
    expect(text).toContain("**breakdown**");
  });

  it("GET /api/v1/usage?format=markdown contains currency field", async () => {
    const { userId } = await seedOrg(db, "org-fmt-6");
    const res = await usageGet(makeReq("/api/v1/usage", userId, { format: "markdown" }));
    const text = await res.text();
    expect(text).toContain("USD");
  });
});
