"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Break-glass controls for an organization. Requires a written reason (min 10
 * chars, mirrored server-side) and double confirmation before firing. The
 * reason lands verbatim in the append-only admin audit log.
 */
export function OrgActions({ organizationId, status }: { organizationId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suspended = status === "suspended";
  const verb = suspended ? "Reinstate" : "Suspend";
  const endpoint = `/api/platform-admin/organizations/${organizationId}/${suspended ? "reinstate" : "suspend"}`;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof json === "object" && json !== null && "error" in json
            ? String((json as { error: { message?: string } }).error.message ?? "Request failed")
            : "Request failed";
        throw new Error(message);
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          suspended
            ? "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
            : "inline-flex h-8 items-center rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
        }
      >
        {verb} organization…
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-amber-300/60 bg-amber-500/[0.04] p-4 dark:border-amber-700/60">
      <p className="text-sm font-medium">{verb} this organization?</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {suspended
          ? "Members and API keys regain access immediately."
          : "All member sessions and API keys are blocked at the next request. Running jobs are not killed."}{" "}
        This action and your reason are permanently recorded.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required, min 10 characters) — e.g. ToS violation ticket #123"
        rows={2}
        className="mt-3 w-full rounded-lg border bg-background p-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/25"
      />
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || reason.trim().length < 10}
          onClick={submit}
          className={
            suspended
              ? "inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              : "inline-flex h-8 items-center rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50"
          }
        >
          {busy ? "Working…" : `Confirm ${verb.toLowerCase()}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
