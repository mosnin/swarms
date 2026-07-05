"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "partial"]);
const POLL_MS = 1500;

/**
 * Keeps an async swarm's detail view live. While the run is non-terminal, it
 * re-fetches the server component on an interval so the customer watches workers
 * finish and the cost tick up — instead of the page freezing on "queued".
 * Stops polling the moment the run reaches a terminal state.
 */
export function SwarmLive({ status }: { status: string }) {
  const router = useRouter();
  const active = !TERMINAL.has(status);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (activeRef.current) router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active, router]);

  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden />
      Live — workers running…
    </span>
  );
}
