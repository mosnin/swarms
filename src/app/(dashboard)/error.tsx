"use client";

/**
 * Route-group error boundary. Catches uncaught errors from server components
 * (e.g. a failed DB read or a permission throw) so a single page failure
 * degrades gracefully instead of rendering a bare 500.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-lg border border-destructive/40 p-6 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        This section couldn&apos;t be loaded. This can happen if you don&apos;t have permission,
        or a service is temporarily unavailable.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        Try again
      </button>
    </div>
  );
}
