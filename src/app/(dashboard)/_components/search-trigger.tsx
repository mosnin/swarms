"use client";

/**
 * Looks exactly like the dashboard search input but is a button: clicking it
 * opens the command palette via the `swarms:open-palette` window event (the
 * palette also opens on Cmd+K / "/").
 */
export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("swarms:open-palette"))}
      className="relative block h-11 w-full rounded-xl border bg-background pl-10 pr-12 text-left text-sm text-muted-foreground shadow-sm outline-none transition-colors hover:border-foreground/20 focus-visible:border-foreground/20"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden>
        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
      </svg>
      Search runs, swarms, connectors…
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">/</kbd>
    </button>
  );
}
