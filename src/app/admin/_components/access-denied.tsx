import { env } from "@/lib/env";

/**
 * Deliberately generic: shown both when signed out and when signed in without
 * an active platform-admin grant. Distinguishing the two in the UI would leak
 * whether a given account holds elevated access to anyone who can guess it.
 */
export function AccessDenied() {
  const oauth = env.AUTH_MODE === "oauth";
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="mx-auto w-full max-w-sm rounded-2xl border bg-background p-8 text-center shadow-sm">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-amber-500/10 text-amber-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
            <path d="M12 8v5M12 16.5v.01" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This console requires an active platform-admin grant.{" "}
          {oauth ? "Sign in with an authorized account to continue." : "Sign in to continue."}
        </p>
        <a
          href="/login"
          className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          Sign in
        </a>
        <a href="/dashboard" className="mt-3 block text-xs text-muted-foreground hover:text-foreground">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
