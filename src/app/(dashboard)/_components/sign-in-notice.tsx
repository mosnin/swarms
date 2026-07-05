import { env } from "@/lib/env";

/** Shown when no session can be resolved (dashboard requires a signed-in user). */
export function SignInNotice() {
  const oauth = env.AUTH_MODE === "oauth";
  return (
    <div className="mx-auto max-w-md rounded-lg border p-6 text-center">
      <h2 className="text-lg font-semibold">Not signed in</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {oauth
          ? "Sign in to access your organization's dashboard."
          : "No active session was found. Sign in to continue."}
      </p>
      <a
        href="/login"
        className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.99]"
      >
        Sign in
      </a>
    </div>
  );
}
