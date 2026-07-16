/**
 * Security: the platform-admin surface fails closed on every branch.
 * - No valid signed session ⇒ UNAUTHORIZED (API keys and forged cookies never work).
 * - Valid session without an active grant ⇒ FORBIDDEN.
 * - Revoked grants stop working immediately.
 * - Break-glass mutations demand a written reason and take real effect:
 *   a suspended organization's members AND API keys are cut off at the
 *   authentication choke point on the next request.
 * - The admin audit trail is append-only at the database level.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import {
  authenticatePlatformAdmin,
  grantPlatformAdmin,
  logAdminAction,
  revokePlatformAdmin,
} from "@/modules/admin/authz";
import {
  assertBreakGlassReason,
  reinstateOrganization,
  revokeApiKeyAsAdmin,
  suspendOrganization,
} from "@/modules/admin/mutations";
import { signSessionToken } from "@/modules/identity/session-token";
import { SESSION_COOKIE } from "@/modules/identity/session";
import { authenticateApiKey, createApiKey, resolveSessionContext } from "@/modules/identity/service";
import { userContext } from "@/modules/identity/access-control";
import { createTestDb, seedOrg, type TestDb } from "../integration/harness";

let db: TestDb;
let orgId: string;
let ownerId: string;

/** Build the minimal NextRequest shape authenticatePlatformAdmin reads. */
function requestWithCookie(value?: string): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        name === SESSION_COOKIE && value !== undefined ? { name, value } : undefined,
    },
  } as unknown as NextRequest;
}

function sessionFor(userId: string): string {
  return signSessionToken(userId, Date.now());
}

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  __setTestDb(db);
  const seeded = await seedOrg(db);
  orgId = seeded.organizationId;
  ownerId = seeded.userId;
});

describe("platform-admin authentication fails closed", () => {
  it("rejects a request with no session cookie", async () => {
    await expect(authenticatePlatformAdmin(requestWithCookie(undefined), db)).rejects.toThrowError(
      /session/i,
    );
  });

  it("rejects a forged (unsigned) cookie", async () => {
    await expect(
      authenticatePlatformAdmin(requestWithCookie(`${ownerId}.9999999999999.forged`), db),
    ).rejects.toThrow();
  });

  it("rejects a valid session whose user holds no grant — org owner is NOT platform admin", async () => {
    await expect(
      authenticatePlatformAdmin(requestWithCookie(sessionFor(ownerId)), db),
    ).rejects.toThrowError(/platform-admin/i);
  });

  it("accepts an active grant and rejects immediately after revocation", async () => {
    await grantPlatformAdmin(ownerId, ownerId, "bootstrap admin for incident response", db);
    const ctx = await authenticatePlatformAdmin(requestWithCookie(sessionFor(ownerId)), db);
    expect(ctx.userId).toBe(ownerId);

    await revokePlatformAdmin(ownerId, ownerId, "off-boarded", db);
    await expect(
      authenticatePlatformAdmin(requestWithCookie(sessionFor(ownerId)), db),
    ).rejects.toThrowError(/platform-admin/i);
  });
});

describe("break-glass reason is mandatory", () => {
  it("rejects missing, non-string, and too-short reasons", () => {
    expect(() => assertBreakGlassReason(undefined)).toThrow();
    expect(() => assertBreakGlassReason(42)).toThrow();
    expect(() => assertBreakGlassReason("too short")).toThrow();
    expect(assertBreakGlassReason("  ToS violation ticket #123  ")).toBe(
      "ToS violation ticket #123",
    );
  });
});

describe("organization suspension has teeth at the auth choke point", () => {
  it("blocks member sessions and API keys of a suspended org, and restores on reinstate", async () => {
    // A working API key before suspension.
    const ownerCtx = userContext({
      organizationId: orgId,
      userId: ownerId,
      membershipId: "m",
      role: "owner",
    });
    const { plaintext } = await createApiKey(ownerCtx, { name: "ci key" }, db);
    await expect(authenticateApiKey(plaintext, db)).resolves.toBeTruthy();
    await expect(resolveSessionContext({ userId: ownerId }, db)).resolves.toBeTruthy();

    await suspendOrganization(orgId, db);

    await expect(authenticateApiKey(plaintext, db)).rejects.toThrowError(/suspended/i);
    await expect(resolveSessionContext({ userId: ownerId }, db)).rejects.toThrowError(/suspended/i);

    await reinstateOrganization(orgId, db);
    await expect(authenticateApiKey(plaintext, db)).resolves.toBeTruthy();
  });

  it("suspend is not idempotent-silent: double-suspend conflicts", async () => {
    await suspendOrganization(orgId, db);
    await expect(suspendOrganization(orgId, db)).rejects.toThrowError(/already suspended/i);
    await expect(reinstateOrganization(orgId, db)).resolves.toBeUndefined();
    await expect(reinstateOrganization(orgId, db)).rejects.toThrowError(/not suspended/i);
  });
});

describe("admin key revocation", () => {
  it("revokes a key across orgs and is idempotent", async () => {
    const ownerCtx = userContext({
      organizationId: orgId,
      userId: ownerId,
      membershipId: "m",
      role: "owner",
    });
    const { key, plaintext } = await createApiKey(ownerCtx, { name: "leaked key" }, db);
    await expect(authenticateApiKey(plaintext, db)).resolves.toBeTruthy();

    const first = await revokeApiKeyAsAdmin(key.id, db);
    expect(first.organizationId).toBe(orgId);
    await expect(authenticateApiKey(plaintext, db)).rejects.toThrowError(/revoked/i);

    // Second revoke is a no-op, not an error.
    await expect(revokeApiKeyAsAdmin(key.id, db)).resolves.toEqual({ organizationId: orgId });
  });
});

describe("admin audit log is append-only at the DB level", () => {
  it("records actions and refuses UPDATE/DELETE", async () => {
    await grantPlatformAdmin(ownerId, ownerId, "bootstrap admin for incident response", db);
    const admin = await authenticatePlatformAdmin(requestWithCookie(sessionFor(ownerId)), db);

    await logAdminAction(
      admin,
      { action: "admin.test.event", resourceType: "platform", reason: "test" },
      db,
    );

    const rows = await db.select().from(schema.adminAuditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("admin.test.event");
    expect(rows[0]!.actorUserId).toBe(ownerId);

    await expect(
      db.update(schema.adminAuditLog).set({ action: "tampered" }),
    ).rejects.toThrowError(/append-only/i);
    await expect(db.delete(schema.adminAuditLog)).rejects.toThrowError(/append-only/i);
  });
});
