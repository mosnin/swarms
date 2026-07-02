import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { __setTestDb } from "@/lib/db";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import { LocalQueue } from "@/server/queue/localQueue";
import { setJobQueue } from "@/server/queue/queue";
import { setRateLimiter, InMemoryRateLimiter } from "@/server/ratelimit/tokenBucket";
import { createTestDb, seedOrg, type TestDb } from "./harness";

import { POST as spawnPost } from "@/app/api/v1/spawn/route";
import { POST as apiKeysPost, GET as apiKeysGet } from "@/app/api/api-keys/route";

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://test.local/api/v1/spawn", {
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
  });
  afterEach(() => {
    __setTestDb(undefined);
    setJobQueue(undefined);
  });

  it("401 when unauthenticated", async () => {
    const res = await spawnPost(req({ task: "do a thing", idempotencyKey: "k-00000001" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("400 on invalid body (bad idempotency key)", async () => {
    const res = await spawnPost(req({ task: "do a thing", idempotencyKey: "x" }, { [SESSION_USER_HEADER]: userId }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
  });

  it("400 on an empty task", async () => {
    const res = await spawnPost(req({ task: "", idempotencyKey: "good-key-0001" }, { [SESSION_USER_HEADER]: userId }));
    expect(res.status).toBe(400);
  });

  it("201 spawns an agent and reports the inherited resources + GPU ceiling", async () => {
    const res = await spawnPost(
      req(
        {
          task: "Summarize the notes",
          resources: { context: "background", env: { TOKEN: "secret" } },
          budgetMinor: 200,
          idempotencyKey: "good-key-0002",
        },
        { [SESSION_USER_HEADER]: userId },
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe("queued");
    expect(body.data.maxGpuSeconds).toBeGreaterThan(0);
    expect(body.data.resources.envKeys).toContain("TOKEN");
    expect(body.data.resources.hasContext).toBe(true);
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
