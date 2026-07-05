/**
 * POST /api/auth/dev-login — LOCAL DEV ADAPTER
 *
 * Mints a signed session cookie for a known user so the dashboard has a working
 * front door in development. BLOCKED in production: a real deployment must wire
 * an identity provider whose callback calls `signSessionToken()` and sets the
 * cookie with the same attributes used here (HttpOnly, Secure, SameSite=Lax).
 *
 * Body: { email: string }
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { ok, route } from "@/lib/api";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { sessionSetCookie } from "@/modules/identity/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ email: z.string().email() });

export async function POST(request: NextRequest): Promise<Response> {
  return route(async () => {
    if (env.NODE_ENV === "production") {
      throw Errors.forbidden("dev-login is disabled in production");
    }

    const json = await request.json().catch(() => null);
    const parsed = body.safeParse(json);
    if (!parsed.success) {
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const db = getDb();
    const user = (
      await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).limit(1)
    )[0];
    if (!user) throw Errors.notFound("No user with that email");

    const response = ok({ userId: user.id, email: user.email });
    response.headers.append("Set-Cookie", sessionSetCookie(user.id, Date.now()));
    return response;
  });
}
