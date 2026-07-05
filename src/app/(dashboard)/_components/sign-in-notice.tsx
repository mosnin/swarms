import { env } from "@/lib/env";

/** Shown when no session can be resolved (dashboard requires a signed-in user). */
export function SignInNotice() {
  const oauth = env.AUTH_MODE === "oauth";
  return (
    <div className="mx-auto max-w-md rounded-lg border p-6 text-center">
      <h2 className="text-lg font-semibold">Not signed in</h2>
      {oauth ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access your organization&apos;s dashboard.
          </p>
          <a
            href="/api/auth/login"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in
          </a>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No active session was found. In local development, set{" "}
          <code className="rounded bg-muted px-1">DEV_AUTH_USER_EMAIL</code> in{" "}
          <code>.env.local</code>, POST to <code>/api/auth/dev-login</code>, or send an{" "}
          <code>x-swarms-user-id</code> header.
        </p>
      )}
    </div>
  );
}
