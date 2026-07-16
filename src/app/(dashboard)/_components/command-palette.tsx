"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

interface Command {
  label: string;
  href: string;
  group: string;
  keywords?: string;
}

const COMMANDS: Command[] = [
  { label: "Spawn an agent", href: "/spawn", group: "Actions", keywords: "new run task worker" },
  { label: "Deploy a hosted agent", href: "/agents", group: "Actions", keywords: "hermes persistent new" },
  { label: "Overview", href: "/dashboard", group: "Workspace" },
  { label: "Hosted agents", href: "/agents", group: "Workspace", keywords: "hermes persistent" },
  { label: "Agent runs", href: "/jobs", group: "Workspace", keywords: "jobs history" },
  { label: "Swarms", href: "/swarms", group: "Workspace" },
  { label: "Simulations", href: "/simulations", group: "Workspace", keywords: "crewai personas" },
  { label: "Schedules", href: "/schedules", group: "Workspace", keywords: "cron recurring" },
  { label: "Approvals", href: "/approvals", group: "Operate", keywords: "pending review" },
  { label: "Evaluations", href: "/evaluations", group: "Operate", keywords: "judge scoring" },
  { label: "Artifacts", href: "/artifacts", group: "Operate", keywords: "files outputs" },
  { label: "Connectors", href: "/connectors", group: "Operate", keywords: "mcp tools integrations" },
  { label: "Usage & spend", href: "/usage", group: "Operate", keywords: "costs analytics billing" },
  { label: "Payments", href: "/payments", group: "Operate", keywords: "x402 receipts wallet" },
  { label: "Audit", href: "/audit", group: "Operate", keywords: "log trail events" },
  { label: "Budgets", href: "/settings/budgets", group: "Settings", keywords: "limits ceiling" },
  { label: "Policies", href: "/settings/policies", group: "Settings", keywords: "rules approval" },
  { label: "API Keys", href: "/settings/api-keys", group: "Settings", keywords: "credentials tokens" },
  { label: "Members", href: "/settings/members", group: "Settings", keywords: "team roles users" },
];

function matches(cmd: Command, query: string): boolean {
  const haystack = `${cmd.label} ${cmd.group} ${cmd.keywords ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/**
 * Cmd+K / Ctrl+K / "/" command palette: keyboard-first navigation to every
 * dashboard surface. Fully client-side, CSP-safe, dependency-free.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => COMMANDS.filter((c) => matches(c, query)), [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(cmd: Command) {
    close();
    router.push(cmd.href);
  }

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b px-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const cmd = results[active];
                if (cmd) go(cmd);
              }
            }}
            placeholder="Where to?"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matches.</p>
          )}
          {results.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            return (
              <div key={`${cmd.group}:${cmd.label}`}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {cmd.group}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(cmd)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    i === active ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  {cmd.label}
                  {i === active && (
                    <kbd className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">↵</kbd>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
