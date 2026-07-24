import type { Metadata } from "next";
import Link from "next/link";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import { StoryHero, TitleEm } from "@/app/(marketing)/_components/story";

export const metadata: Metadata = {
  title: "Changelog — Swarms",
  description: "What we shipped, when, and why it matters.",
};

type Category = "New" | "Improved" | "Fixed";

const CATEGORY_TONE: Record<Category, string> = {
  New: "bg-emerald-500/10 text-emerald-700",
  Improved: "bg-blue-500/10 text-blue-700",
  Fixed: "bg-amber-500/10 text-amber-700",
};

interface Entry {
  date: string;
  category: Category;
  title: string;
  body: string;
  href?: string;
}

const MONTHS: { label: string; entries: Entry[] }[] = [
  {
    label: "July 2026",
    entries: [
      {
        date: "Jul 24",
        category: "New",
        title: "Hosted agents can bill for standby",
        body: "A hosted agent now costs a small metered fee for every hour it stays on call, charged exactly once per hour to the append-only ledger. Runs out of funds and it suspends itself; top up and it resumes.",
        href: "/features/hosted-agents",
      },
      {
        date: "Jul 16",
        category: "New",
        title: "Ten feature and use-case pages, a mega menu, and a living site",
        body: "The marketing site grew into a full story: parallel swarms, hosted agents, budgets, governance, automation, and six worked examples — with a hover-intent mega menu, an announcement bar, and a hero that reveals word by word.",
        href: "/features/spawn",
      },
      {
        date: "Jul 16",
        category: "New",
        title: "Hosted agents (Hermes), phase one",
        body: "Deploy a persistent agent in one click. It keeps a durable memory, wakes on a message or a heartbeat, and every wake is a metered, budget-capped run.",
        href: "/features/hosted-agents",
      },
      {
        date: "Jul 16",
        category: "New",
        title: "Platform-admin console",
        body: "A separate, session-only, fully audited surface for operating the platform across tenants — with break-glass controls that demand a written reason.",
      },
      {
        date: "Jul 16",
        category: "New",
        title: "Command palette",
        body: "Press Cmd+K anywhere in the dashboard to jump to any surface. Keyboard-first, dependency-free.",
      },
      {
        date: "Jul 16",
        category: "Improved",
        title: "The dashboard reads as one product",
        body: "Every page moved onto the same primitives — one header, one table, one status badge, one money formatter — and money inputs now parse to integer minor units with no floating point in sight.",
      },
      {
        date: "Jul 16",
        category: "Fixed",
        title: "Marketing pages stopped stuttering on scroll",
        body: "The ambient gradient blooms were re-rasterizing a heavy blur every frame. They are now pre-faded gradients that composite for free — same look, none of the lag.",
      },
      {
        date: "Jul 12",
        category: "New",
        title: "Market simulations",
        body: "Run a synthetic focus group of up to 32 personas against a decision before you ship it, priced per persona plus metered compute.",
        href: "/use-cases/simulations",
      },
      {
        date: "Jul 6",
        category: "New",
        title: "Sign in with your identity provider",
        body: "Production login over OAuth (authorization-code + PKCE), provider-agnostic, with signed session cookies.",
      },
      {
        date: "Jul 6",
        category: "Fixed",
        title: "The worker actually runs jobs",
        body: "The agent worker's run endpoint now executes the job instead of acknowledging it — the difference between a demo and a product.",
      },
      {
        date: "Jul 2",
        category: "New",
        title: "Spawn, swarms, budgets, and the ledger",
        body: "The foundation: spawn a sandboxed worker in one call, fan a job out to sixteen, cap every run with a hard budget, and record every cent on a double-entry, append-only ledger.",
        href: "/features/budgets",
      },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="violet"
          eyebrow="Changelog"
          title={
            <>
              Every week,
              <br />
              <TitleEm accent="violet">a little sharper.</TitleEm>
            </>
          }
          lede="What we shipped and why it matters. No roadmap theater — only what is live."
          primary={{ href: "/login", label: "Get started" }}
          secondary={{ href: "/docs", label: "Read the docs" }}
        />
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-24">
        {MONTHS.map((month) => (
          <section key={month.label} className="mt-8">
            <Reveal>
              <h2 className="sticky top-24 z-10 bg-white/80 py-2 font-mono text-xs font-medium uppercase tracking-widest text-neutral-400 backdrop-blur">
                {month.label}
              </h2>
            </Reveal>
            <RevealGroup className="mt-4 space-y-8" stagger={0.05}>
              {month.entries.map((entry, i) => (
                <div key={i} className="grid gap-3 sm:grid-cols-[5.5rem_1fr]">
                  <p className="pt-0.5 font-mono text-xs text-neutral-400">{entry.date}</p>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_TONE[entry.category]}`}>
                        {entry.category}
                      </span>
                      <h3 className="text-[15px] font-medium text-neutral-950">{entry.title}</h3>
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{entry.body}</p>
                    {entry.href && (
                      <Link
                        href={entry.href}
                        className="group mt-2 inline-flex items-center text-[13px] font-medium text-violet-600"
                      >
                        Learn more
                        <span className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
                          →
                        </span>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </RevealGroup>
          </section>
        ))}
      </div>

      <CtaBand />
    </main>
  );
}
