/** Distributed fixed-window rate-limit counters (shared across web instances). */

import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
);
