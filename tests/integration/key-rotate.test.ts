/**
 * Integration: API key rotation. Rotating mints a new secret for the SAME key
 * row — the old secret stops authenticating immediately, the new one works, and
 * the key's id + scoped budget are preserved. Revoked keys cannot rotate.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __setTestDb } from "@/lib/db";
import { userContext } from "@/modules/identity/access-control";
import {
  authenticateApiKey,
  createApiKey,
  revokeApiKey,
  rotateApiKey,
} from "@/modules/identity/service";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: API key rotation", () => {
  let db: TestDb;
  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => {
    __setTestDb(undefined);
  });

  it("rotates in place: old secret dies, new works, id + budget preserved", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-rot-1");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });

    const created = await createApiKey(
      ctx,
      { name: "ci-bot", scopes: ["jobs.create", "jobs.read"], budgetMinor: 1_000 },
      db,
    );
    // Old secret authenticates.
    const before = await authenticateApiKey(created.plaintext, db);
    expect(before.organizationId).toBe(organizationId);

    const rotated = await rotateApiKey(ctx, created.key.id, db);
    expect(rotated.key.id).toBe(created.key.id); // same logical key
    expect(rotated.plaintext).not.toBe(created.plaintext);
    expect(rotated.key.budgetMinor).toBe(1_000); // scoped budget preserved
    expect(rotated.key.scopes).toEqual(created.key.scopes);

    // New secret works; old one is dead.
    const after = await authenticateApiKey(rotated.plaintext, db);
    expect(after.organizationId).toBe(organizationId);
    await expect(authenticateApiKey(created.plaintext, db)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses to rotate a revoked key", async () => {
    const { organizationId, userId } = await seedOrg(db, "org-rot-2");
    const ctx = userContext({ organizationId, userId, membershipId: "m", role: "owner" });
    const created = await createApiKey(ctx, { name: "dead-key" }, db);
    await revokeApiKey(ctx, created.key.id, db);
    await expect(rotateApiKey(ctx, created.key.id, db)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("enforces org isolation", async () => {
    const a = await seedOrg(db, "org-rot-3a");
    const b = await seedOrg(db, "org-rot-3b");
    const ctxA = userContext({ organizationId: a.organizationId, userId: a.userId, membershipId: "m", role: "owner" });
    const ctxB = userContext({ organizationId: b.organizationId, userId: b.userId, membershipId: "m", role: "owner" });
    const created = await createApiKey(ctxA, { name: "a-key" }, db);
    await expect(rotateApiKey(ctxB, created.key.id, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
