/**
 * Integration: OAuth login provisioning + callback CSRF guard.
 * - First login creates the user + a personal org (owner membership + wallet).
 * - The callback rejects a mismatched anti-CSRF `state` before any token exchange.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { resolveOrCreateUserByEmail, userHasMembership } from "@/modules/identity/provisioning";
import { createTestDb, type TestDb } from "./harness";

describe("integration: OAuth login", () => {
  let db: TestDb;
  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => {
    __setTestDb(undefined);
    delete process.env.AUTH_MODE;
    delete process.env.APP_BASE_URL;
  });

  it("provisions a user + personal org on first login, idempotent thereafter", async () => {
    const first = await resolveOrCreateUserByEmail("alice@example.com", "Alice", db);
    expect(first.created).toBe(true);
    expect(await userHasMembership(first.userId, db)).toBe(true);

    // Org + wallet exist for the new user's membership.
    const memberships = await db
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, first.userId));
    expect(memberships.length).toBe(1);
    expect(memberships[0]?.role).toBe("owner");
    const wallets = await db
      .select()
      .from(schema.wallets)
      .where(eq(schema.wallets.organizationId, memberships[0]!.organizationId));
    expect(wallets.length).toBe(1);

    // Second login with the same email returns the same user, creates nothing new.
    const second = await resolveOrCreateUserByEmail("alice@example.com", "Alice", db);
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);
    const allUsers = await db.select().from(schema.users);
    expect(allUsers.length).toBe(1);
  });

  it("normalizes email case so the same identity is one user", async () => {
    const a = await resolveOrCreateUserByEmail("Bob@Example.com", "Bob", db);
    const b = await resolveOrCreateUserByEmail("bob@example.com", "Bob", db);
    expect(a.userId).toBe(b.userId);
  });

  it("callback rejects a mismatched state (CSRF) before any token exchange", async () => {
    process.env.AUTH_MODE = "oauth";
    process.env.APP_BASE_URL = "http://app.local";
    const { GET } = await import("@/app/api/auth/callback/route");

    const req = new NextRequest(
      "http://app.local/api/auth/callback?code=abc&state=attacker-state",
      { headers: { cookie: "swarms_oauth_state=real-state; swarms_oauth_verifier=v123" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(307); // redirect
    expect(res.headers.get("location")).toContain("auth_error=invalid_state");
    // No session cookie was set.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toContain("swarms_session=ey");
  });
});
