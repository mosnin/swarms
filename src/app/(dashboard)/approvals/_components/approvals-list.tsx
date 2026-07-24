"use client";

import { useMemo, useState } from "react";

import { Id } from "@/components/ui/id";
import { format } from "@/lib/money";
import { cn } from "@/lib/utils";
import { summarizeHeld } from "@/modules/approvals/held-summary";

export interface ApprovalItem {
  id: string;
  costMinor: number;
  costCurrency: string;
  capabilityKind: string;
  task: string | null;
  createdAt: string;
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Mobile-first approvals inbox. Each held job is a tap-friendly card: one big
 * Approve, and a Decline that reveals an optional reason before it commits.
 * Approving/declining removes the card in place — no full reload.
 */
export function ApprovalsList({ initial }: { initial: ApprovalItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const held = useMemo(() => summarizeHeld(items), [items]);

  async function approve(jobId: string) {
    setBusy(jobId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/approvals/${jobId}/approve`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? "Failed to approve");
      setItems((prev) => prev.filter((i) => i.id !== jobId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setBusy(null);
    }
  }

  async function decline(jobId: string) {
    setBusy(jobId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/approvals/${jobId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? "Failed to decline");
      setItems((prev) => prev.filter((i) => i.id !== jobId));
      setDeclining(null);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to decline");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm font-medium">Inbox zero</p>
        <p className="mt-1 text-sm text-muted-foreground">No jobs awaiting approval.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {held.count} job{held.count === 1 ? "" : "s"} awaiting you
        </span>
        <span className="text-sm font-medium tabular-nums">
          {format({ amountMinor: held.totalMinor, currency: held.currency })} held
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="space-y-3">
        {items.map((item) => {
          const isDeclining = declining === item.id;
          const isBusy = busy === item.id;
          return (
            <li key={item.id} className="rounded-xl border bg-background p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize">
                      {item.capabilityKind}
                    </span>
                    <span className="text-xs text-muted-foreground">{ago(item.createdAt)}</span>
                  </div>
                  {item.task && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-foreground">{item.task}</p>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    <Id value={item.id} href={`/jobs/${item.id}`} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold tabular-nums">
                    {format({ amountMinor: item.costMinor, currency: item.costCurrency })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">est. hard cap</p>
                </div>
              </div>

              {isDeclining ? (
                <div className="mt-3 space-y-2">
                  <input
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void decline(item.id);
                      if (e.key === "Escape") {
                        setDeclining(null);
                        setReason("");
                      }
                    }}
                    maxLength={1_000}
                    placeholder="Reason (optional) — recorded on the audit trail"
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/25"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void decline(item.id)}
                      className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-red-600 text-sm font-medium text-white transition-all hover:bg-red-700 active:scale-[0.99] disabled:opacity-50"
                    >
                      {isBusy ? "Declining…" : "Confirm decline"}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setDeclining(null);
                        setReason("");
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void approve(item.id)}
                    className={cn(
                      "inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-50",
                    )}
                  >
                    {isBusy ? "Approving…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setDeclining(item.id);
                      setReason("");
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-lg border px-5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Decline
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
