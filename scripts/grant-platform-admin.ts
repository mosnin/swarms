/**
 * First-admin bootstrap: grant platform-admin access to a user by email.
 *
 * The platform-admin surface is deliberately unreachable through the app for a
 * user who holds no grant — and no org role confers it — so the very first
 * grant has to be seeded out of band. This is that break-glass path. Every
 * subsequent grant should go through an authenticated admin, not this script.
 *
 * Usage:
 *   npx tsx scripts/grant-platform-admin.ts <email> "<reason, 10+ chars>"
 *
 * Requires a valid DATABASE_URL (validated at import via src/lib/env.ts, which
 * fails fast if it is missing). The target user must already exist — sign in
 * once through the app first so the users row is created.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { grantPlatformAdmin } from "@/modules/admin/authz";

const argSchema = z.object({
  email: z.string().email("first argument must be a valid email address"),
  reason: z.string().trim().min(10, "reason must be at least 10 characters"),
});

async function main(): Promise<void> {
  const [emailArg, reasonArg] = process.argv.slice(2);
  const parsed = argSchema.safeParse({ email: emailArg, reason: reasonArg });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.message}`).join("\n");
    throw new Error(
      `Invalid arguments:\n${issues}\n\n` +
        `Usage: npx tsx scripts/grant-platform-admin.ts <email> "<reason, 10+ chars>"`,
    );
  }
  const { email, reason } = parsed.data;

  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    throw new Error(
      `No user with email ${email}. Have them sign in through the app once to ` +
        `create their account, then re-run this script.`,
    );
  }

  // Self-bootstrap: grantedBy === target, since no admin exists yet to attribute it to.
  logger.info("Self-bootstrapping platform admin (grantedBy = target)", { userId: user.id });
  const grantId = await grantPlatformAdmin(user.id, user.id, reason, db);
  logger.info("Platform-admin grant created", { grantId, userId: user.id, email: user.email });
  // eslint-disable-next-line no-console
  console.log(`Granted platform-admin to ${user.email} (grant ${grantId}).`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`\nFailed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
