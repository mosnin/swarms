"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AgentControls({ agentInstanceId, status }: { agentInstanceId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function call(path: string, method: "POST" | "DELETE") {
    setBusy(true);
    try {
      await fetch(path, { method });
      router.refresh();
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  async function clone() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/agents/${agentInstanceId}/clone`, { method: "POST" });
      const json: unknown = await res.json().catch(() => null);
      const newId =
        json && typeof json === "object" && "data" in json
          ? (json as { data?: { agent?: { id?: string } } }).data?.agent?.id
          : undefined;
      if (newId) router.push(`/agents/${newId}`);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === "suspended") return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void clone()}
        className="inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        Clone
      </button>
      {status === "active" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => call(`/api/v1/agents/${agentInstanceId}/pause`, "POST")}
          className="inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Pause
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => call(`/api/v1/agents/${agentInstanceId}/resume`, "POST")}
          className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          Resume
        </button>
      )}
      {confirmDelete ? (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void call(`/api/v1/agents/${agentInstanceId}`, "DELETE").then(() => router.push("/agents"));
            }}
            className="inline-flex h-8 items-center rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50"
          >
            Confirm terminate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(false)}
            className="inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium hover:bg-muted"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          className="inline-flex h-8 items-center rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          Terminate…
        </button>
      )}
    </div>
  );
}
