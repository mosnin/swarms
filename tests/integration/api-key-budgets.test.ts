/**
 * Integration tests for API key scoped budgets (#19).
 *
 * When creating an API key with `budgetMinor`, a monthly hard-stop budget
 * scoped to that key is auto-created. The budget is returned in ApiKeyView
 * on list, create, and revoke.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import { SESSION_USER_HEADER } from "@/modules/identity/session";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "@/modules/identity/service";
import { createTestDb, seedOrg, type TestDb } from "./harness";
import { GET, POST } from "@/app/api/v1/keys/route";
import { DELETE } from "@/app/api/v1/keys/[keyId]/route";

function authHeader(userId: string): Record<string, string> {
  return { [SESSION_USER_HEADER]: userId };
}

function makeGetReq(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://test.local${path}`, { headers });
}

function makePostReq(path: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://test.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeDeleteReq(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://test.local${path}`, { method: "DELETE", headers });
}

describe("integration: API key scoped budgets", () => {
  let db: TestDb;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });

  afterEach(() => {
    __setTestDb(undefined);
  });

  // --- service-layer tests ---

  it("creates a key with no budget when budgetMinor is omitted", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-key-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const { key } = await createApiKey(ctx, { name: "no-budget key" }, db);
    expect(key.budgetMinor).toBeNull();
    expect(key.budgetCurrency).toBeNull();
  });

  it("creates a key with a scoped budget when budgetMinor is provided", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-key-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const { key } = await createApiKey(ctx, { name: "capped key", budgetMinor: 5000, budgetCurrency: "USD" }, db);
    expect(key.budgetMinor).toBe(5000);
    expect(key.budgetCurrency).toBe("USD");
  });

  it("defaults budget currency to USD when not specified", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-key-3");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const { key } = await createApiKey(ctx, { name: "default-currency key", budgetMinor: 1000 }, db);
    expect(key.budgetCurrency).toBe("USD");
  });

  it("listApiKeys returns budget fields for all keys", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-key-4");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    await createApiKey(ctx, { name: "capped", budgetMinor: 2000 }, db);
    await createApiKey(ctx, { name: "uncapped" }, db);

    const keys = await listApiKeys(ctx, db);
    expect(keys).toHaveLength(2);

    const capped = keys.find((k) => k.name === "capped");
    const uncapped = keys.find((k) => k.name === "uncapped");

    expect(capped?.budgetMinor).toBe(2000);
    expect(capped?.budgetCurrency).toBe("USD");
    expect(uncapped?.budgetMinor).toBeNull();
    expect(uncapped?.budgetCurrency).toBeNull();
  });

  it("revokeApiKey returns budget fields", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-key-5");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const { key: created } = await createApiKey(ctx, { name: "capped", budgetMinor: 3000 }, db);
    const revoked = await revokeApiKey(ctx, created.id, db);

    expect(revoked.budgetMinor).toBe(3000);
    expect(revoked.budgetCurrency).toBe("USD");
    expect(revoked.revokedAt).toBeTruthy();
  });

  it("scoped budget is stored with apiKeyId in scope JSONB", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-key-6");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const { key } = await createApiKey(ctx, { name: "key-with-budget", budgetMinor: 9999 }, db);
    const budgets = await db.select().from(schema.budgets);
    const budget = budgets.find((b) => {
      const s = b.scope as Record<string, unknown> | null;
      return s?.apiKeyId === key.id;
    });
    expect(budget).toBeTruthy();
    expect(budget?.limitMinor).toBe(9999);
    expect(budget?.hardStop).toBe(true);
    expect(budget?.period).toBe("monthly");
  });

  // --- HTTP route tests ---

  it("POST /api/v1/keys creates key without budget", async () => {
    const { userId } = await seedOrg(db, "org-key-7");
    const res = await POST(
      makePostReq("/api/v1/keys", { name: "test-key" }, authHeader(userId)),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { plaintext: string; key: { budgetMinor: null } } };
    expect(typeof body.data.plaintext).toBe("string");
    expect(body.data.key.budgetMinor).toBeNull();
  });

  it("POST /api/v1/keys creates key with budget", async () => {
    const { userId } = await seedOrg(db, "org-key-8");
    const res = await POST(
      makePostReq(
        "/api/v1/keys",
        { name: "capped", budgetMinor: 10000, budgetCurrency: "USD" },
        authHeader(userId),
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { key: { budgetMinor: number; budgetCurrency: string } } };
    expect(body.data.key.budgetMinor).toBe(10000);
    expect(body.data.key.budgetCurrency).toBe("USD");
  });

  it("GET /api/v1/keys lists keys with budget info", async () => {
    const { userId } = await seedOrg(db, "org-key-9");
    // Create a key first
    await POST(makePostReq("/api/v1/keys", { name: "listed", budgetMinor: 500 }, authHeader(userId)));

    const res = await GET(makeGetReq("/api/v1/keys", authHeader(userId)));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { keys: Array<{ name: string; budgetMinor: number | null }> } };
    expect(body.data.keys).toHaveLength(1);
    expect(body.data.keys[0]?.budgetMinor).toBe(500);
  });

  it("DELETE /api/v1/keys/:keyId revokes a key", async () => {
    const { userId } = await seedOrg(db, "org-key-10");
    const createRes = await POST(
      makePostReq("/api/v1/keys", { name: "to-revoke", budgetMinor: 1000 }, authHeader(userId)),
    );
    const { data: createData } = await createRes.json() as { data: { key: { id: string } } };

    const deleteRes = await DELETE(
      makeDeleteReq(`/api/v1/keys/${createData.key.id}`, authHeader(userId)),
      { params: Promise.resolve({ keyId: createData.key.id }) },
    );
    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json() as { data: { key: { revokedAt: string; budgetMinor: number } } };
    expect(body.data.key.revokedAt).toBeTruthy();
    expect(body.data.key.budgetMinor).toBe(1000);
  });

  it("POST /api/v1/keys returns 400 for invalid body (missing name)", async () => {
    const { userId } = await seedOrg(db, "org-key-11");
    const res = await POST(
      makePostReq("/api/v1/keys", { budgetMinor: 100 }, authHeader(userId)),
    );
    expect(res.status).toBe(400);
  });

  it("POST /api/v1/keys returns 400 for negative budgetMinor", async () => {
    const { userId } = await seedOrg(db, "org-key-12");
    const res = await POST(
      makePostReq("/api/v1/keys", { name: "bad", budgetMinor: -100 }, authHeader(userId)),
    );
    expect(res.status).toBe(400);
  });
});
