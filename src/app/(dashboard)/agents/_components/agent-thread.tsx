"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

interface ThreadMessage {
  id: string;
  role: string;
  content: string;
  processedAt: Date | string | null;
  createdAt: Date | string;
}

/**
 * Message thread + composer. Sending enqueues a wake; replies land when the
 * worker completes the wake job, so we refresh on an interval while a message
 * is pending instead of holding a connection open.
 */
export function AgentThread({
  agentInstanceId,
  status,
  initialMessages,
}: {
  agentInstanceId: string;
  status: string;
  initialMessages: ThreadMessage[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const awaitingReply = initialMessages.some((m) => m.role === "user" && !m.processedAt);

  // Poll for the agent's reply while one is pending (worker ticks ~1s; the
  // wake job itself takes seconds) — a light refresh, not a live socket.
  useEffect(() => {
    if (!awaitingReply) return;
    const timer = setInterval(() => router.refresh(), 4_000);
    return () => clearInterval(timer);
  }, [awaitingReply, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [initialMessages.length]);

  async function send() {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/agents/${agentInstanceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof json === "object" && json !== null && "error" in json
            ? String((json as { error: { message?: string } }).error.message ?? "Send failed")
            : "Send failed";
        throw new Error(message);
      }
      setDraft("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border bg-background shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {initialMessages.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No messages yet. Say something — the agent wakes, runs, and replies here.
          </p>
        )}
        {initialMessages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                m.role === "user"
                  ? "rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-bl-md bg-muted",
              )}
            >
              {m.content}
              <div
                className={cn(
                  "mt-1 text-[10px]",
                  m.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground",
                )}
              >
                {new Date(m.createdAt).toLocaleTimeString()}
                {m.role === "user" && !m.processedAt && " · queued"}
              </div>
            </div>
          </div>
        ))}
        {awaitingReply && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:150ms]">●</span>
                <span className="animate-pulse [animation-delay:300ms]">●</span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3">
        {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={status !== "active" || busy}
            placeholder={status === "active" ? "Message your agent…" : `Agent is ${status}`}
            className="h-10 flex-1 rounded-xl border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/25 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={status !== "active" || busy || !draft.trim()}
            className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
