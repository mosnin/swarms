"use client";

import { useEffect, useRef, useState } from "react";

import { format } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Live wake console. Opens an SSE connection to the agent's stream and renders
 * a real-time feed of what the agent is doing — waking, running, spending,
 * replying — so you watch it work instead of refreshing the thread. Read-only;
 * the composer lives in the thread panel.
 */

interface FeedEntry {
  key: string;
  kind: "status" | "wake" | "message" | "system";
  at: number;
  text: string;
  detail?: string;
  tone?: "muted" | "active" | "good" | "bad";
}

const STATUS_TONE: Record<string, FeedEntry["tone"]> = {
  active: "good",
  paused: "muted",
  suspended: "bad",
  terminated: "bad",
};

const JOB_TONE: Record<string, FeedEntry["tone"]> = {
  queued: "muted",
  running: "active",
  succeeded: "good",
  failed: "bad",
  cancelled: "muted",
};

const TONE_CLASS: Record<NonNullable<FeedEntry["tone"]>, string> = {
  muted: "bg-muted-foreground/40",
  active: "bg-blue-500",
  good: "bg-emerald-500",
  bad: "bg-red-500",
};

const MAX_ENTRIES = 200;

export function WakeConsole({ agentInstanceId }: { agentInstanceId: string }) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [live, setLive] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const push = (e: Omit<FeedEntry, "key" | "at">) => {
      seq.current += 1;
      const entry: FeedEntry = { ...e, key: `${Date.now()}-${seq.current}`, at: Date.now() };
      setEntries((prev) => [...prev, entry].slice(-MAX_ENTRIES));
    };

    const source = new EventSource(`/api/v1/agents/${agentInstanceId}/stream`);

    source.addEventListener("open", () => setLive(true));

    source.addEventListener("agent.snapshot", (ev) => {
      const d = safeParse(ev);
      push({ kind: "system", text: "Connected — watching live", tone: "active" });
      if (d?.status) push({ kind: "status", text: `Agent is ${d.status}`, tone: STATUS_TONE[String(d.status)] });
    });

    source.addEventListener("agent.status", (ev) => {
      const d = safeParse(ev);
      if (d?.status) push({ kind: "status", text: `Agent → ${d.status}`, tone: STATUS_TONE[String(d.status)] });
    });

    source.addEventListener("wake.update", (ev) => {
      const d = safeParse(ev);
      if (!d) return;
      const status = String(d.status);
      const cost =
        typeof d.costMinor === "number" && d.costMinor > 0
          ? format({ amountMinor: d.costMinor, currency: String(d.currency ?? "USD") })
          : undefined;
      push({
        kind: "wake",
        text: `Wake ${status}`,
        detail: cost ? `${cost} spent` : undefined,
        tone: JOB_TONE[status] ?? "muted",
      });
    });

    source.addEventListener("message", (ev) => {
      const d = safeParse(ev);
      if (!d) return;
      const role = String(d.role);
      push({
        kind: "message",
        text: role === "agent" ? "Agent replied" : "Message received",
        detail: typeof d.content === "string" ? d.content : undefined,
        tone: role === "agent" ? "good" : "muted",
      });
    });

    source.addEventListener("stream.closed", (ev) => {
      const d = safeParse(ev);
      push({ kind: "system", text: `Stream closed${d?.reason ? ` · ${d.reason}` : ""}`, tone: "muted" });
      setLive(false);
      source.close();
    });

    source.onerror = () => {
      // EventSource retries automatically; reflect the gap in the UI.
      setLive(false);
    };

    return () => source.close();
  }, [agentInstanceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  return (
    <div className="rounded-xl border bg-background shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-sm font-medium">Live wake console</p>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            {live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            )}
            <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", live ? "bg-emerald-500" : "bg-muted-foreground/40")} />
          </span>
          {live ? "live" : "idle"}
        </span>
      </div>

      <div className="max-h-72 min-h-[7rem] overflow-y-auto p-3 font-mono text-[12px] leading-relaxed">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Waiting for activity. Send a message and watch the agent wake, run, and reply here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((e) => (
              <li key={e.key} className="flex items-start gap-2">
                <span className="pt-1 text-[10px] tabular-nums text-muted-foreground/70">
                  {new Date(e.at).toLocaleTimeString()}
                </span>
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_CLASS[e.tone ?? "muted"])} />
                <span className="min-w-0">
                  <span className="text-foreground">{e.text}</span>
                  {e.detail && (
                    <span className="ml-1.5 break-words text-muted-foreground">
                      — {e.detail.length > 160 ? `${e.detail.slice(0, 160)}…` : e.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function safeParse(ev: MessageEvent): Record<string, unknown> | null {
  try {
    return JSON.parse(ev.data) as Record<string, unknown>;
  } catch {
    return null;
  }
}
