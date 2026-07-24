import Image from "next/image";
import Link from "next/link";

import { FooterWordmark } from "@/app/(marketing)/_components/footer-wordmark";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import { FEATURES, USE_CASES } from "@/app/(marketing)/_lib/site-map";

const COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Features",
    links: FEATURES.map((f) => ({ href: f.href, label: f.name })),
  },
  {
    title: "Use cases",
    links: USE_CASES.map((u) => ({ href: u.href, label: u.name })),
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Quickstart" },
      { href: "/docs/agents", label: "Hosted agents" },
      { href: "/docs/swarms", label: "Swarms" },
      { href: "/docs/webhooks", label: "Webhooks" },
      { href: "/docs/errors", label: "Errors" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/company", label: "Company" },
      { href: "/security", label: "Security" },
      { href: "/changelog", label: "Changelog" },
      { href: "/status", label: "Status" },
      { href: "/login", label: "Sign in" },
      { href: "mailto:hello@swarms.dev", label: "Contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-neutral-100">
      <RevealGroup className="mx-auto grid max-w-5xl gap-10 px-6 py-14 sm:grid-cols-2 md:grid-cols-5" stagger={0.05}>
        <div className="space-y-3">
          <Link href="/" className="inline-flex items-center" aria-label="Swarms — home">
            <Image src="/logo.png" alt="Swarms" width={686} height={160} className="h-6 w-auto" />
          </Link>
          <p className="max-w-xs text-sm text-neutral-500">
            An on-demand labor force for your AI agent. Rent GPU by the second, hard budget ceilings, every
            run metered and auditable.
          </p>
          <p className="flex items-center gap-1.5 pt-1 text-xs text-neutral-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Every run metered · every action ledgered
          </p>
        </div>

        {COLS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold text-neutral-900">{col.title}</h3>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-neutral-500 transition-colors hover:text-neutral-950">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </RevealGroup>

      {/* Oversized wordmark, clipped at the container edge — a quiet signature
          that rises in letter by letter and carries a gradient sweep on hover. */}
      <Reveal>
        <FooterWordmark />
      </Reveal>

      <div className="relative border-t border-neutral-100 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-neutral-400 sm:flex-row">
          <p>© {new Date().getFullYear()} Swarms — Agent Capability Cloud.</p>
          <p>Built for autonomous agents.</p>
        </div>
      </div>
    </footer>
  );
}
