/**
 * Server-component helper to resolve the current {@link AuthContext} from the
 * incoming request's cookies/headers. For use in App Router server components
 * and server actions (not route handlers, which already receive the request).
 */

import { cookies, headers } from "next/headers";

import { authenticateRequest } from "@/modules/identity/service";
import type { AuthContext } from "@/modules/identity/access-control";

export async function currentContext(): Promise<AuthContext> {
  const headerList = await headers();
  const cookieStore = await cookies();
  return authenticateRequest({
    headers: headerList,
    cookies: {
      get: (name: string) => {
        const entry = cookieStore.get(name);
        return entry ? { value: entry.value } : undefined;
      },
    },
  });
}

/** Like {@link currentContext} but returns `null` instead of throwing. */
export async function tryCurrentContext(): Promise<AuthContext | null> {
  try {
    return await currentContext();
  } catch {
    return null;
  }
}
