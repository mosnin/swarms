/** Shown when no session can be resolved (dashboard requires a signed-in user). */
export function SignInNotice() {
  return (
    <div className="mx-auto max-w-md rounded-lg border p-6 text-center">
      <h2 className="text-lg font-semibold">Not signed in</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        No active session was found. In local development, set{" "}
        <code className="rounded bg-muted px-1">DEV_AUTH_USER_EMAIL</code> in{" "}
        <code>.env.local</code> or send an <code>x-swarms-user-id</code> header.
      </p>
    </div>
  );
}
