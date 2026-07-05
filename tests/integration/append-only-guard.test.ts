/**
 * Integration: the DB-level append-only trigger makes UPDATE/DELETE on the money
 * ledger and audit trail structurally impossible (migration 0017). INSERTs and
 * reads are unaffected; corrections must be compensating rows.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import * as schema from "@/lib/db/schema";
import { __setTestDb } from "@/lib/db";
import { appendEntry } from "@/modules/billing/ledger-service";
import { dbLedgerStore } from "@/modules/billing/ledger-repository";
import { createTestDb, seedOrg, type TestDb } from "./harness";

describe("integration: append-only DB guard", () => {
  let db: TestDb;
  beforeEach(async () => {
    ({ db } = await createTestDb());
    __setTestDb(db as Parameters<typeof __setTestDb>[0]);
  });
  afterEach(() => __setTestDb(undefined));

  it("allows INSERT but blocks UPDATE and DELETE on usage_ledger_entries", async () => {
    const { organizationId } = await seedOrg(db, "org-ao-1");

    const entry = await appendEntry(dbLedgerStore(db), {
      organizationId,
      direction: "credit",
      kind: "payment",
      amountMinor: 100,
      currency: "USD",
      description: "test",
      refType: "payment_receipt",
      refId: "rcpt_x",
    });

    // UPDATE is rejected by the trigger.
    await expect(
      db
        .update(schema.usageLedgerEntries)
        .set({ amountMinor: 999 })
        .where(eq(schema.usageLedgerEntries.id, entry.id)),
    ).rejects.toThrow(/append-only/i);

    // DELETE is rejected by the trigger.
    await expect(
      db.delete(schema.usageLedgerEntries).where(eq(schema.usageLedgerEntries.id, entry.id)),
    ).rejects.toThrow(/append-only/i);

    // The row is intact and unchanged.
    const [row] = await db
      .select()
      .from(schema.usageLedgerEntries)
      .where(eq(schema.usageLedgerEntries.id, entry.id));
    expect(row?.amountMinor).toBe(100);
  });

  it("blocks UPDATE on audit_events", async () => {
    const { organizationId } = await seedOrg(db, "org-ao-2");
    const [ev] = await db
      .insert(schema.auditEvents)
      .values({
        organizationId,
        action: "test.event",
        resourceType: "test",
        resourceId: "r1",
      })
      .returning();
    if (!ev) throw new Error("insert failed");

    await expect(
      db.update(schema.auditEvents).set({ action: "tampered" }).where(eq(schema.auditEvents.id, ev.id)),
    ).rejects.toThrow(/append-only/i);
  });

  it("keeps the trigger function present after migration", async () => {
    const res = await db.execute(
      sql`SELECT proname FROM pg_proc WHERE proname = 'swarms_forbid_mutation'`,
    );
    const rows = Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? [];
    expect(rows.length).toBe(1);
  });
});
