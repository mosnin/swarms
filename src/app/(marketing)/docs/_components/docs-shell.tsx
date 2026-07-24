import Link from "next/link";

import { Reveal } from "@/app/(marketing)/_components/reveal";
import { DocsNav } from "@/app/(marketing)/docs/_components/docs-nav";
import { DocsToc } from "@/app/(marketing)/docs/_components/docs-toc";
import { DOCS_PAGES } from "@/app/(marketing)/docs/_lib/nav";

/**
 * Shared three-column docs layout: page nav (left), content (center), and the
 * in-page section anchors (right). Every docs page renders through this so the
 * chrome, spacing, and navigation stay identical across the section.
 */
export function DocsShell({
  eyebrow,
  title,
  lede,
  toc,
  next,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede: string;
  toc: { id: string; label: string }[];
  /** Optional "next page" pointer for the footer. */
  next?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-8 pt-16 sm:pt-20">
      <Reveal className="max-w-2xl">
        <p className="text-sm font-medium tracking-wide text-violet-600">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-light tracking-tight text-neutral-950">{title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-500">{lede}</p>
      </Reveal>

      <div className="mt-12 flex gap-12">
        <DocsNav />

        <div className="min-w-0 flex-1 space-y-10">
          {children}

          {next && (
            <Link
              href={next.href}
              className="group flex items-center justify-between rounded-2xl border border-neutral-100 bg-gradient-to-br from-violet-50/60 to-white p-6 transition-colors hover:border-violet-200"
            >
              <span>
                <span className="block text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Next
                </span>
                <span className="mt-0.5 block text-[15px] font-medium text-neutral-950">{next.label}</span>
              </span>
              <span className="text-neutral-400 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </Link>
          )}
        </div>

        <div className="hidden xl:block">
          <DocsToc items={toc} />
        </div>
      </div>
    </main>
  );
}

/** Small helper: the doc page that follows `href` in the ordered nav. */
export function nextAfter(href: string): { href: string; label: string } | undefined {
  const i = DOCS_PAGES.findIndex((p) => p.href === href);
  const next = i >= 0 ? DOCS_PAGES[i + 1] : undefined;
  return next ? { href: next.href, label: next.label } : undefined;
}
