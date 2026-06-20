import { describe, expect, it } from "vitest";

import { fixedClock } from "@/lib/time";
import * as ledgerService from "@/modules/billing/ledger-service";
import {
  appendEntry,
  computeBalanceMinor,
  reverseEntry,
  type LedgerEntryRecord,
  type LedgerStore,
} from "@/modules/billing/ledger-service";

/**
 * In-memory store exposing ONLY insert + read — it has no update or delete
 * method, mirroring the append-only contract. Inserted rows are frozen.
 */
class InMemoryLedgerStore implements LedgerStore {
  readonly rows: LedgerEntryRecord[] = [];

  async insert(record: LedgerEntryRecord): Promise<LedgerEntryRecord> {
    this.rows.push(record);
    return record;
  }

  async findById(id: string): Promise<LedgerEntryRecord | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async listByOrganization(organizationId: string): Promise<LedgerEntryRecord[]> {
    return this.rows.filter((row) => row.organizationId === organizationId);
  }
}

const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));

const base = {
  organizationId: "org_test",
  walletId: "wlt_test",
  currency: "USD",
} as const;

describe("usage ledger append-only", () => {
  it("appends frozen entries that cannot be mutated", async () => {
    const store = new InMemoryLedgerStore();
    const entry = await appendEntry(
      store,
      { ...base, direction: "debit", kind: "charge", amountMinor: 500 },
      clock,
    );

    expect(Object.isFrozen(entry)).toBe(true);
    // Mutating a frozen entry throws in strict mode (ESM modules are strict).
    expect(() => {
      (entry as { amountMinor: number }).amountMinor = 1;
    }).toThrow(TypeError);
    expect(entry.amountMinor).toBe(500);
  });

  it("exposes no update or delete operation on the service", () => {
    // The append-only contract is enforced by the absence of a mutation path.
    expect((ledgerService as Record<string, unknown>).updateEntry).toBeUndefined();
    expect((ledgerService as Record<string, unknown>).deleteEntry).toBeUndefined();
    expect((ledgerService as Record<string, unknown>).update).toBeUndefined();
  });

  it("corrects via a compensating entry, leaving the original intact", async () => {
    const store = new InMemoryLedgerStore();
    const original = await appendEntry(
      store,
      { ...base, jobId: "job_1", direction: "debit", kind: "charge", amountMinor: 500 },
      clock,
    );

    const reversal = await reverseEntry(store, original.id, "duplicate charge", clock);

    expect(store.rows).toHaveLength(2);
    expect(reversal.direction).toBe("credit");
    expect(reversal.refId).toBe(original.id);
    // Original is byte-for-byte unchanged.
    const reloaded = await store.findById(original.id);
    expect(reloaded).toEqual(original);
    // Net balance is zero after reversal.
    expect(computeBalanceMinor(store.rows)).toBe(0);
  });

  it("computes net balance from credits and debits", async () => {
    const store = new InMemoryLedgerStore();
    await appendEntry(
      store,
      { ...base, direction: "credit", kind: "payment", amountMinor: 1000 },
      clock,
    );
    await appendEntry(
      store,
      { ...base, direction: "debit", kind: "charge", amountMinor: 300 },
      clock,
    );
    const entries = await store.listByOrganization("org_test");
    expect(computeBalanceMinor(entries)).toBe(700);
  });

  it("rejects non-integer and non-positive amounts", async () => {
    const store = new InMemoryLedgerStore();
    await expect(
      appendEntry(store, { ...base, direction: "debit", kind: "charge", amountMinor: 1.5 }, clock),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      appendEntry(store, { ...base, direction: "debit", kind: "charge", amountMinor: -10 }, clock),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
