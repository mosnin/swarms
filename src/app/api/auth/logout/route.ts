/**
 * POST /api/auth/logout — clear the session cookie.
 */

import type { NextRequest } from "next/server";

import { ok, route } from "@/lib/api";
import { sessionClearCookie } from "@/modules/identity/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest): Promise<Response> {
  return route(async () => {
    const response = ok({ loggedOut: true });
    response.headers.append("Set-Cookie", sessionClearCookie());
    return response;
  });
}
