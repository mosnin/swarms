import Link from "next/link";

import { FeatureIcon } from "@/app/(marketing)/_components/feature-icons";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import { ACCENT, FEATURES, USE_CASES } from "@/app/(marketing)/_lib/site-map";

/**
 * "Keep exploring" strip at the bottom of feature and use-case pages —
 * three sibling pages, chosen by slug, in the shared card language.
 */
export function RelatedStrip({ title = "Keep exploring", slugs }: { title?: string; slugs: string[] }) {
  const all = [...FEATURES, ...USE_CASES];
  const pages = slugs.map((s) => all.find((p) => p.slug === s)).filter((p) => p !== undefined);

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <Reveal>
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{title}</p>
      </Reveal>
      <RevealGroup className="mt-6 grid gap-3 sm:grid-cols-3" stagger={0.06}>
        {pages.map((page) => {
          const accent = ACCENT[page.accent];
          return (
            <Link
              key={page.slug}
              href={page.href}
              className="group rounded-2xl border border-neutral-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-[0_12px_32px_-16px_rgb(0_0_0/0.15)]"
            >
              <span className={`grid h-9 w-9 place-items-center rounded-lg ${accent.bg} ${accent.text} transition-transform duration-200 group-hover:scale-105`}>
                <FeatureIcon slug={page.slug} className="h-[18px] w-[18px]" />
              </span>
              <p className="mt-3.5 flex items-center gap-1 text-[15px] font-medium text-neutral-950">
                {page.name}
                <span className="translate-x-0 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-60" aria-hidden>
                  →
                </span>
              </p>
              <p className="mt-1 text-[13px] leading-snug text-neutral-500">{page.tagline}</p>
            </Link>
          );
        })}
      </RevealGroup>
    </section>
  );
}
