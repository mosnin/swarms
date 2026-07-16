/**
 * Server-component helper to resolve the current {@link PlatformAdminContext}
 * from the incoming request's cookies. For use in the `/admin` App Router
 * layout/pages (not route handlers, which use `authenticatePlatformAdmin`
 * directly). Mirrors `modules/identity/current.ts`.
 */

import { cookies } from "next/headers";

import { authenticatePlatformAdminFromCookieStore, type PlatformAdminContext } from "@/modules/admin/authz";

export async function currentPlatformAdmin(): Promise<PlatformAdminContext> {
  const cookieStore = await cookies();
  return authenticatePlatformAdminFromCookieStore({
    get: (name: string) => {
      const entry = cookieStore.get(name);
      return entry ? { value: entry.value } : undefined;
    },
  });
}

/** Like {@link currentPlatformAdmin} but returns `null` instead of throwing. */
export async function tryCurrentPlatformAdmin(): Promise<PlatformAdminContext | null> {
  try {
    return await currentPlatformAdmin();
  } catch {
    return null;
  }
}
