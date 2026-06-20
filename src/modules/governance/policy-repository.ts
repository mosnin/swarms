/**
 * Loads an organization's policy rules into the shape the pure
 * {@link evaluatePolicy} engine consumes. Rule conditions are stored as JSONB
 * and treated as an opaque {@link PolicyConditions} bag here.
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type {
  PolicyConditions,
  PolicyEffect,
  PolicyRule,
} from "@/server/policy/evaluatePolicy";

type Db = ReturnType<typeof getDb>;

export async function loadPolicyRules(
  organizationId: string,
  db: Db = getDb(),
): Promise<PolicyRule[]> {
  const rows = await db
    .select()
    .from(schema.policyRules)
    .where(and(eq(schema.policyRules.organizationId, organizationId), eq(schema.policyRules.enabled, true)))
    .orderBy(desc(schema.policyRules.priority));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    effect: row.effect as PolicyEffect,
    priority: row.priority,
    enabled: row.enabled,
    conditions: (row.conditions ?? {}) as PolicyConditions,
  }));
}
