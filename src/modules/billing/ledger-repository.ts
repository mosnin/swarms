/**
 * Postgres-backed adapter for the append-only {@link LedgerStore} port. There is
 * deliberately no update/delete path — corrections are compensating inserts via
 * `reverseEntry`. Rows map 1:1 to `usage_ledger_entries`.
 */

import { asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Errors } from "@/lib/errors";
import type {
  LedgerDirection,
  LedgerEntryKind,
  LedgerEntryRecord,
  LedgerStore,
} from "@/modules/billing/ledger-service";

type Db = ReturnType<typeof getDb>;
type Row = typeof schema.usageLedgerEntries.$inferSelect;

function toRecord(row: Row): LedgerEntryRecord {
  return Object.freeze({
    id: row.id,
    organizationId: row.organizationId,
    walletId: row.walletId,
    jobId: row.jobId,
    direction: row.direction as LedgerDirection,
    kind: row.kind as LedgerEntryKind,
    amountMinor: row.amountMinor,
    currency: row.currency,
    description: row.description,
    refType: row.refType,
    refId: row.refId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function dbLedgerStore(db: Db = getDb()): LedgerStore {
  return {
    async insert(record) {
      const inserted = (
        await db
          .insert(schema.usageLedgerEntries)
          .values({
            id: record.id,
            organizationId: record.organizationId,
            walletId: record.walletId,
            jobId: record.jobId,
            direction: record.direction,
            kind: record.kind,
            amountMinor: record.amountMinor,
            currency: record.currency,
            description: record.description,
            refType: record.refType,
            refId: record.refId,
          })
          .returning()
      )[0];
      if (!inserted) throw Errors.internal("Failed to append ledger entry");
      return toRecord(inserted);
    },
    async findById(id) {
      const row = (
        await db
          .select()
          .from(schema.usageLedgerEntries)
          .where(eq(schema.usageLedgerEntries.id, id))
          .limit(1)
      )[0];
      return row ? toRecord(row) : null;
    },
    async listByOrganization(organizationId) {
      const rows = await db
        .select()
        .from(schema.usageLedgerEntries)
        .where(eq(schema.usageLedgerEntries.organizationId, organizationId))
        .orderBy(asc(schema.usageLedgerEntries.createdAt));
      return rows.map(toRecord);
    },
  };
}
