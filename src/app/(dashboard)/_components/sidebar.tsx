"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Inline icons (18px, stroke = currentColor) — CSP-safe, no icon CDN. */
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
    <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>
  ),
  spawn: (p: IconProps) => (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>),
  jobs: (p: IconProps) => (<Svg {...p}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.1" /><circle cx="3.5" cy="12" r="1.1" /><circle cx="3.5" cy="18" r="1.1" /></Svg>),
  swarms: (p: IconProps) => (<Svg {...p}><circle cx="12" cy="5" r="2.1" /><circle cx="5" cy="18" r="2.1" /><circle cx="19" cy="18" r="2.1" /><path d="M12 7.1 6.4 15.9M12 7.1l5.6 8.8M7.2 18h9.6" /></Svg>),
  approvals: (p: IconProps) => (<Svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="M9 11.5l2 2 4-4" /></Svg>),
  connectors: (p: IconProps) => (<Svg {...p}><path d="M6 9V6a3 3 0 0 1 6 0v3M9 15v3a3 3 0 0 0 6 0v-3" /><rect x="4" y="9" width="10" height="6" rx="1.5" /><path d="M14 12h4" /></Svg>),
  usage: (p: IconProps) => (<Svg {...p}><path d="M4 20V4M4 20h16" /><path d="M8 16v-3M12 16v-6M16 16v-9" /></Svg>),
  payments: (p: IconProps) => (<Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18" /></Svg>),
  audit: (p: IconProps) => (<Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></Svg>),
  budgets: (p: IconProps) => (<Svg {...p}><path d="M3 7h15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 7V6a2 2 0 0 1 2-2h11" /><circle cx="16.5" cy="12.5" r="1.2" /></Svg>),
  policies: (p: IconProps) => (<Svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /></Svg>),
  keys: (p: IconProps) => (<Svg {...p}><circle cx="8" cy="8" r="3.4" /><path d="M10.4 10.4 20 20M16 16l2-2M13.5 13.5l2-2" /></Svg>),
  members: (p: IconProps) => (<Svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2-4.3" /></Svg>),
  plus: (p: IconProps) => (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>),
  menu: (p: IconProps) => (<Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>),
  close: (p: IconProps) => (<Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>),
  chevron: (p: IconProps) => (<Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>),
};

type NavItem = { href: string; label: string; icon: (p: IconProps) => React.ReactNode };
const GROUPS: { title: string; tree?: boolean; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: Icons.overview },
      { href: "/jobs", label: "Agent runs", icon: Icons.jobs },
      { href: "/swarms", label: "Swarms", icon: Icons.swarms },
    ],
  },
  {
    title: "Operate",
    items: [
      { href: "/approvals", label: "Approvals", icon: Icons.approvals },
      { href: "/connectors", label: "Connectors", icon: Icons.connectors },
      { href: "/usage", label: "Usage & spend", icon: Icons.usage },
      { href: "/payments", label: "Payments", icon: Icons.payments },
      { href: "/audit", label: "Audit", icon: Icons.audit },
    ],
  },
  {
    title: "Settings",
    tree: true,
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapse = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  const railHidden = collapsed; // desktop icon-rail

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center gap-3 border-b bg-background px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted active:scale-95"
        >
          <Icons.menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
          <Brand />
          Swarms
        </Link>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        data-collapsed={railHidden}
        className={cn(
          "flex shrink-0 flex-col bg-background",
          // Mobile: off-canvas drawer.
          "fixed inset-y-0 left-0 z-40 w-[264px] border-r shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: in-flow, collapsible, no drawer shadow.
          "lg:static lg:z-auto lg:translate-x-0 lg:border-r-0 lg:shadow-none lg:transition-[width]",
          railHidden ? "lg:w-[68px]" : "lg:w-[248px]",
        )}
      >
        {/* Brand row */}
        <div className="flex h-14 items-center gap-2 px-3">
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 font-semibold tracking-tight"
          >
            <Brand />
            <span
              className={cn(
                "truncate text-[15px] transition-[opacity] duration-200",
                railHidden && "lg:pointer-events-none lg:opacity-0",
              )}
            >
              Swarms
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          >
            <Icons.close className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={railHidden ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "ml-auto hidden h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-muted active:scale-90 lg:grid",
              railHidden && "lg:absolute lg:left-1/2 lg:top-14 lg:-translate-x-1/2",
            )}
          >
            <Icons.chevron className={cn("h-4 w-4 transition-transform duration-200", railHidden && "rotate-180")} />
          </button>
        </div>

        {/* Primary action */}
        <div className="px-3 pb-1 pt-1">
          <Link
            href="/spawn"
            className={cn(
              "flex h-9 items-center justify-center gap-1.5 rounded-lg border bg-background text-sm font-medium shadow-sm transition-all hover:bg-muted active:scale-[0.98]",
              railHidden && "lg:px-0",
            )}
          >
            <Icons.plus className="h-4 w-4" />
            <span className={cn(railHidden && "lg:hidden")}>Spawn agent</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2">
          {GROUPS.map((group, gi) => (
            <div key={group.title} className={cn(gi > 0 && "mt-4")}>
              <div className="h-5 px-2">
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 transition-opacity duration-150",
                    railHidden && "lg:opacity-0",
                  )}
                >
                  {group.title}
                </span>
              </div>

              <ul className={cn("mt-0.5 space-y-0.5", group.tree && !railHidden && "lg:relative lg:ml-3 lg:border-l lg:pl-2")}>
                {group.items.map((item) => {
                  const active = mounted && isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={railHidden ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-2 py-[7px] text-sm transition-colors duration-150",
                          railHidden && "lg:justify-center",
                          active
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <span className="transition-transform duration-150 group-hover:scale-110 motion-reduce:transition-none">
                          {item.icon({ className: cn("h-[17px] w-[17px]", active ? "text-foreground" : "text-muted-foreground") })}
                        </span>
                        <span className={cn("truncate", railHidden && "lg:hidden")}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

/** The dark rounded-square brand mark. */
function Brand() {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">
      S
    </span>
  );
}
