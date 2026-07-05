import { cn } from "@/lib/utils";

/**
 * Status pill: a themed dot + label so status is never conveyed by color alone
 * (accessible) and reads correctly in both light and dark. Covers job + swarm +
 * webhook lifecycle states; unknown values fall back to neutral.
 */
type Tone = "green" | "blue" | "amber" | "red" | "slate";

const TONE: Record<Tone, { dot: string; text: string; bg: string }> = {
  green: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10" },
  blue: { dot: "bg-blue-500", text: "text-blue-700 dark:text-blue-300", bg: "bg-blue-500/10" },
  amber: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-500/10" },
  red: { dot: "bg-red-500", text: "text-red-700 dark:text-red-300", bg: "bg-red-500/10" },
  slate: { dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-300", bg: "bg-slate-500/10" },
};

const STATUS_TONE: Record<string, Tone> = {
  succeeded: "green",
  delivered: "green",
  active: "green",
  running: "blue",
  delivering: "blue",
  queued: "amber",
  pending: "amber",
  partial: "amber",
  awaiting_approval: "amber",
  awaiting_payment: "amber",
  failed: "red",
  error: "red",
  cancelled: "slate",
  canceled: "slate",
  revoked: "slate",
};

/** Human label: snake_case → "Snake case". */
function label(status: string): string {
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const tone = TONE[STATUS_TONE[status] ?? "slate"];
  const pulse = status === "running" || status === "delivering";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        tone.bg,
        tone.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot, pulse && "animate-pulse")} aria-hidden />
      {label(status)}
    </span>
  );
}
