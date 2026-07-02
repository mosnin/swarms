/**
 * POST /api/auth/logout — clear the session cookie.
 */

import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/modules/identity/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest): Promise<Response> {
  return route(async () => {
    const response = ok({ loggedOut: true });
    const secure = env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    );
    return response;
  });
}
