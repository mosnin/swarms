"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

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
  organizations: (p: IconProps) => (<Svg {...p}><rect x="3" y="10" width="7" height="11" rx="1" /><rect x="14" y="4" width="7" height="17" rx="1" /><path d="M6 14h1M6 17h1M17 8h1M17 11h1M17 14h1" /></Svg>),
  jobs: (p: IconProps) => (<Svg {...p}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.1" /><circle cx="3.5" cy="12" r="1.1" /><circle cx="3.5" cy="18" r="1.1" /></Svg>),
  audit: (p: IconProps) => (<Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></Svg>),
  menu: (p: IconProps) => (<Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>),
  close: (p: IconProps) => (<Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>),
  shield: (p: IconProps) => (<Svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="M9 11.5l2 2 4-4" /></Svg>),
};

const ITEMS: { href: string; label: string; icon: (p: IconProps) => React.ReactNode }[] = [
  { href: "/admin", label: "Overview", icon: Icons.overview },
  { href: "/admin/organizations", label: "Organizations", icon: Icons.organizations },
  { href: "/admin/jobs", label: "Jobs", icon: Icons.jobs },
  { href: "/admin/audit-log", label: "Audit log", icon: Icons.audit },
];

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"));

  return (
    <>
      <div className="flex items-center gap-3 border-b bg-background px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted active:scale-95"
        >
          <Icons.menu className="h-5 w-5" />
        </button>
        <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
          <Brand />
          Admin
        </Link>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "flex shrink-0 flex-col bg-background",
          "fixed inset-y-0 left-0 z-40 w-[248px] border-r shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-auto lg:w-[248px] lg:translate-x-0 lg:border-r-0 lg:shadow-none",
        )}
      >
        <div className="flex h-14 items-center gap-2 px-3">
          <Link href="/admin" className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 font-semibold tracking-tight">
            <Brand />
            <span className="truncate text-[15px]">Admin</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          >
            <Icons.close className="h-4 w-4" />
          </button>
        </div>

        {/* Elevated-access indicator */}
        <div className="mx-3 mb-1 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <Icons.shield className="h-3.5 w-3.5" />
          Platform admin · logged
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2">
          <ul className="mt-0.5 space-y-0.5">
            {ITEMS.map((item) => {
              const active = mounted && isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-2 py-[7px] text-sm transition-colors duration-150",
                      active
                        ? "bg-amber-500/10 font-medium text-amber-800 dark:text-amber-300"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <span className="transition-transform duration-150 group-hover:scale-110 motion-reduce:transition-none">
                      {item.icon({ className: cn("h-[17px] w-[17px]", active ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground") })}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t p-3">
          <p className="truncate text-[11px] text-muted-foreground" title={email}>{email}</p>
          <Link href="/dashboard" className="mt-1 block text-[11px] text-muted-foreground hover:text-foreground">
            ← Back to dashboard
          </Link>
        </div>
      </aside>
    </>
  );
}

function Brand() {
  return <Image src="/logo-mark.png" alt="" width={512} height={512} className="-my-1 h-8 w-8 shrink-0" priority />;
}
