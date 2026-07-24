"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DOCS_PAGES } from "@/app/(marketing)/docs/_lib/nav";

/** Left sidebar listing every docs page, highlighting the current one. */
export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-28 hidden w-48 shrink-0 md:block">
      <p className="px-3 pb-2 font-mono text-[11px] uppercase tracking-widest text-neutral-300">Docs</p>
      <ul className="space-y-0.5">
        {DOCS_PAGES.map((page) => {
          const active = pathname === page.href;
          return (
            <li key={page.href}>
              <Link
                href={page.href}
                className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-violet-50 font-medium text-violet-700"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                {page.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
