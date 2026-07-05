"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Inline icons (16px, stroke = currentColor). Kept inline so they      */
/* work under the strict CSP — no external icon font/CDN.               */
/* ------------------------------------------------------------------ */

type IconProps = { className?: string };
const Svg = ({ children, className }: IconProps & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("h-[18px] w-[18px] shrink-0", className)}
    aria-hidden
  >
    {children}
  </svg>
);

const Icons = {
  overview: (p: IconProps) => (
    <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Svg>
  ),
  spawn: (p: IconProps) => (
    <Svg {...p}><path d="M12 3v18M3 12h18" /></Svg>
  ),
  jobs: (p: IconProps) => (
    <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.2" /><circle cx="3.5" cy="12" r="1.2" /><circle cx="3.5" cy="18" r="1.2" /></Svg>
  ),
  swarms: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="5" r="2.2" /><circle cx="5" cy="18" r="2.2" /><circle cx="19" cy="18" r="2.2" /><path d="M12 7.2 6.4 15.9M12 7.2l5.6 8.7M7.2 18h9.6" /></Svg>
  ),
  approvals: (p: IconProps) => (
    <Svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="M9 11.5l2 2 4-4" /></Svg>
  ),
  connectors: (p: IconProps) => (
    <Svg {...p}><path d="M6 9V6a3 3 0 0 1 6 0v3M9 15v3a3 3 0 0 0 6 0v-3" /><rect x="4" y="9" width="10" height="6" rx="1.5" /><path d="M14 12h4" /></Svg>
  ),
  usage: (p: IconProps) => (
    <Svg {...p}><path d="M4 20V4M4 20h16" /><path d="M8 16v-3M12 16v-6M16 16v-9" /></Svg>
  ),
  payments: (p: IconProps) => (
    <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></Svg>
  ),
  audit: (p: IconProps) => (
    <Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></Svg>
  ),
  budgets: (p: IconProps) => (
    <Svg {...p}><path d="M3 7h15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 7V6a2 2 0 0 1 2-2h11" /><circle cx="16.5" cy="12.5" r="1.3" /></Svg>
  ),
  policies: (p: IconProps) => (
    <Svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /></Svg>
  ),
  keys: (p: IconProps) => (
    <Svg {...p}><circle cx="8" cy="8" r="3.5" /><path d="M10.5 10.5 20 20M16 16l2-2M13.5 13.5l2-2" /></Svg>
  ),
  members: (p: IconProps) => (
    <Svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2-4.3" /></Svg>
  ),
  chevron: (p: IconProps) => (
    <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>
  ),
} satisfies Record<string, (p: IconProps) => React.ReactNode>;

/* ------------------------------------------------------------------ */

type NavItem = { href: string; label: string; icon: (p: IconProps) => React.ReactNode };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: Icons.overview },
      { href: "/spawn", label: "Spawn agent", icon: Icons.spawn },
      { href: "/jobs", label: "Agent runs", icon: Icons.jobs },
      { href: "/swarms", label: "Swarms", icon: Icons.swarms },
    ],
  },
  {
    title: "Operate",
    items: [
      { href: "/approvals", label: "Approvals", icon: Icons.approvals },
      { href: "/connectors", label: "Connectors", icon: Icons.connectors },
      { href: "/usage", label: "Usage & GPU spend", icon: Icons.usage },
      { href: "/payments", label: "Payments", icon: Icons.payments },
      { href: "/audit", label: "Audit", icon: Icons.audit },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/settings/budgets", label: "Budgets", icon: Icons.budgets },
      { href: "/settings/policies", label: "Policies", icon: Icons.policies },
      { href: "/settings/api-keys", label: "API Keys", icon: Icons.keys },
      { href: "/settings/members", label: "Members", icon: Icons.members },
    ],
  },
];

const STORAGE_KEY = "swarms:sidebar:collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore the persisted preference on mount (SSR renders expanded; the width
  // transition makes the initial collapse read as intentional, not a flash).
  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  // Linear-style `[` shortcut to toggle the sidebar (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el?.isContentEditable) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/")) || pathname === href;

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 z-20 flex h-screen shrink-0 flex-col border-r",
        // Frosted-glass surface — translucent where the browser supports it.
        "bg-muted/30 supports-[backdrop-filter]:bg-muted/15 supports-[backdrop-filter]:backdrop-blur-xl",
        "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        collapsed ? "w-[64px]" : "w-60",
      )}
    >
      {/* Brand + collapse toggle */}
      <div className="flex h-14 items-center gap-2 px-3">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 font-semibold tracking-tight transition-colors hover:text-foreground"
          aria-label="Swarms home"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
            S
          </span>
          <span
            className={cn(
              "truncate text-[15px] transition-[opacity,transform] duration-200",
              collapsed ? "pointer-events-none -translate-x-1 opacity-0" : "opacity-100",
            )}
          >
            Swarms
          </span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expand sidebar  [" : "Collapse sidebar  ["}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground",
            "transition-all duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-90",
            collapsed && "absolute left-1/2 top-14 -translate-x-1/2",
          )}
        >
          <Icons.chevron
            className={cn(
              "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
              collapsed && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4", collapsed && "pt-4")}>
        {GROUPS.map((group, gi) => (
          <div key={group.title} className={cn(gi > 0 && "mt-5")}>
            {/* Section label — fades to a hairline divider when collapsed */}
            <div className="h-5 px-2">
              <span
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 transition-opacity duration-150",
                  collapsed ? "opacity-0" : "opacity-100",
                )}
              >
                {group.title}
              </span>
              {collapsed && <span className="mx-auto mt-2 block h-px w-6 bg-border" />}
            </div>

            <ul className="mt-1 space-y-0.5">
              {group.items.map((item) => {
                const active = mounted && isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md px-2 py-[7px] text-sm",
                        "transition-colors duration-150 motion-reduce:transition-none",
                        collapsed && "justify-center",
                        active
                          ? "bg-foreground/[0.06] font-medium text-foreground"
                          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                      )}
                    >
                      {/* Animated active accent bar */}
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary",
                          "origin-left transition-transform duration-200 ease-out motion-reduce:transition-none",
                          active ? "scale-y-100" : "scale-y-0",
                        )}
                      />
                      <span className="transition-transform duration-150 group-hover:scale-110 motion-reduce:transition-none">
                        {item.icon({ className: active ? "text-foreground" : "" })}
                      </span>
                      <span
                        className={cn(
                          "truncate transition-[opacity,transform] duration-200",
                          collapsed ? "pointer-events-none w-0 -translate-x-1 opacity-0" : "opacity-100",
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer hint */}
      <div className="border-t px-3 py-2">
        <span
          className={cn(
            "text-[11px] text-muted-foreground/60 transition-opacity duration-150",
            collapsed ? "opacity-0" : "opacity-100",
          )}
        >
          Toggle with{" "}
          <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">[</kbd>
        </span>
      </div>
    </aside>
  );
}
