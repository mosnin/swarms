import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { setRateLimiter, InMemoryRateLimiter } from "@/server/ratelimit/tokenBucket";
import { createTestDb, seedOrg, type TestDb } from "./harness";

import { POST as executePost } from "@/app/api/v1/execute/route";
import { POST as apiKeysPost, GET as apiKeysGet } from "@/app/api/api-keys/route";

const manifest = {
  name: "Echo",
  version: "1.0.0",
  description: "",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  permissions: [],
  riskLevel: "low",
  estimatedCostMinor: 0,
  estimatedDurationMs: 1,
  maxRuntimeMs: 5000,
  supportsParallelism: false,
};

async function publishSkill(db: TestDb, organizationId: string) {
  const skill = (
    await db
      .insert(schema.skills)
      .values({ organizationId, slug: "echo", name: "Echo", visibility: "private" })
      .returning()
  )[0]!;
  await db.insert(schema.skillVersions).values({
    skillId: skill.id,
    organizationId,
    version: "1.0.0",
    status: "published",
    publishedAt: new Date(),
    manifest,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    runnerType: "mock",
    priceMinor: 0,
    priceCurrency: "USD",
  });
}

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://test.local/api/v1/execute", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("integration: HTTP route handlers", () => {
  let db: TestDb;
  let userId: string;

  beforeEach(async () => {
    setJobQueue(new LocalQueue());
    setRateLimiter(new InMemoryRateLimiter());
    ({ db } = await createTestDb());
    __setTestDb(db as never);
    ({ userId } = await seedOrg(db));
    await publishSkill(db, (await db.select().from(schema.organizations))[0]!.id);
  });
  afterEach(() => {
    __setTestDb(undefined);
    setJobQueue(undefined);
  });

  it("401 when unauthenticated", async () => {
    const res = await executePost(req({ skillSlug: "echo", input: {}, idempotencyKey: "k-00000001" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("400 on invalid body (bad idempotency key)", async () => {
    const res = await executePost(req({ skillSlug: "echo", input: {}, idempotencyKey: "x" }, { [SESSION_USER_HEADER]: userId }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
  });

  it("201 on a valid authenticated execute", async () => {
    const res = await executePost(
      req({ skillSlug: "echo", input: {}, idempotencyKey: "good-key-0001" }, { [SESSION_USER_HEADER]: userId }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe("queued");
  });

  it("404 capability not found for an unknown skill", async () => {
    const res = await executePost(
      req({ skillSlug: "nope", input: {}, idempotencyKey: "good-key-0002" }, { [SESSION_USER_HEADER]: userId }),
    );
    expect(res.status).toBe(404);
  });

  it("api-keys: create returns plaintext once, list never includes it", async () => {
    const createReq = new NextRequest("http://test.local/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json", [SESSION_USER_HEADER]: userId },
      body: JSON.stringify({ name: "ci" }),
    });
    const created = await apiKeysPost(createReq);
    expect(created.status).toBe(201);
    const cbody = await created.json();
    expect(cbody.data.plaintext).toMatch(/^hk_/);

    const listReq = new NextRequest("http://test.local/api/api-keys", {
      headers: { [SESSION_USER_HEADER]: userId },
    });
    const listed = await apiKeysGet(listReq);
    const lbody = await listed.json();
    expect(JSON.stringify(lbody)).not.toContain(cbody.data.plaintext);
    expect(lbody.data.keys[0].prefix).toBeTruthy();
  });
});
