import type { Metadata } from "next";
import Link from "next/link";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import { BigStatement, Em, Pull, StoryHero, TitleEm } from "@/app/(marketing)/_components/story";

export const metadata: Metadata = {
  title: "Company — Swarms",
  description: "Why we're building the labor layer for autonomous agents.",
};

const PRINCIPLES = [
  {
    n: "01",
    title: "Hard ceilings, not soft alerts",
    body: "An alert arrives after the money is gone. A ceiling means it never leaves. We build the second kind, everywhere, even when it's harder — because 'you can never be surprised' is the entire promise.",
  },
  {
    n: "02",
    title: "Receipts, not trust",
    body: "Every action an agent takes on this platform is metered, logged, and written to a ledger that can only grow. We don't ask you to trust the system; we hand you the evidence and make it impossible for us to edit.",
  },
  {
    n: "03",
    title: "Sandboxes, not promises",
    body: "Untrusted work runs in a locked room with nothing in its pockets. Isolation is a property of the architecture, not a paragraph in a policy — the safe path is the only path that exists.",
  },
  {
    n: "04",
    title: "Boring money math",
    body: "Integers only. Idempotency keys on everything paid. Charging is exactly-once even when networks aren't. Financial infrastructure should be the least interesting thing about us — that takes real work.",
  },
  {
    n: "05",
    title: "Machines are customers too",
    body: "Our API is self-describing, our errors are typed, our payments speak HTTP 402. An agent that knows only our base URL can discover everything else. We design for callers who read specs, not brochures.",
  },
  {
    n: "06",
    title: "Taste is a thousand small calls",
    body: "The easing curve, the empty state, the error message at 2am. None of them matter alone; all of them together are the product. We sweat them in order, forever.",
  },
];

export default function CompanyPage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="violet"
          eyebrow="Company"
          title={
            <>
              Every agent deserves
              <br />
              <TitleEm accent="violet">a workforce.</TitleEm>
            </>
          }
          lede="Swarms is the labor layer for autonomous agents: sandboxed workers, hard budgets, honest ledgers. We're building the boring, load-bearing part of the agent economy."
          primary={{ href: "/login", label: "Try the product" }}
          secondary={{ href: "/docs", label: "Read the docs" }}
        />
      </div>

      <BigStatement accentWords={["delegate", "economy", "infrastructure"]}>
        Software agents are learning to do real work. But an economy isn’t made of workers — it’s made of the ability to delegate: to hire, to pay, to verify, to hold accountable. That connective tissue is infrastructure, and someone has to build it straight.
      </BigStatement>

      {/* The story */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Why this exists</p>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="mt-6 space-y-5 text-lg leading-relaxed text-neutral-500">
            <p>
              The first generation of agents worked alone. They were impressive and exhausting in
              equal measure — one context window doing the work of a department, dropping threads,
              timing out, hallucinating under load.
            </p>
            <p>
              The fix was obvious to anyone who has ever run a team: <Em>stop making one worker do
              everything.</Em> Let it delegate. But delegation between machines needs what delegation
              between people needs — a way to hand over context, a budget that can’t be blown, proof
              of what was done, and someone accountable when it wasn’t.
            </p>
            <p>
              So that’s what we built. Not a smarter model — <Em>a labor market for the models that
              exist</Em>: spawn a worker in one call, hand it your tools and a ceiling, get back a
              result and a receipt. Everything else on this site is a footnote to that sentence.
            </p>
          </div>
        </Reveal>
      </section>

      {/* Principles */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">How we build</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-950">
            Six principles we won’t trade.
          </h2>
        </Reveal>
        <RevealGroup className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3" stagger={0.06}>
          {PRINCIPLES.map((p) => (
            <div key={p.n} className="group">
              <p className="font-mono text-xs text-neutral-300 transition-colors duration-300 group-hover:text-violet-500">
                {p.n}
              </p>
              <p className="mt-2 text-[15px] font-medium text-neutral-950">{p.title}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-neutral-500">{p.body}</p>
            </div>
          ))}
        </RevealGroup>
      </section>

      <Pull accent="violet" attribution="The bet, in one line">
        The companies that mattered in the last platform shift sold picks and ledgers, not gold. We
        intend to be very good at ledgers.
      </Pull>

      {/* Work with us */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-3 sm:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl border border-neutral-200 bg-white p-7">
              <p className="text-[15px] font-medium text-neutral-950">Work with us</p>
              <p className="mt-2 text-[14px] leading-relaxed text-neutral-500">
                We’re a small team that ships daily and argues about easing curves. If append-only
                ledgers and sandbox escape vectors are your idea of fun, we should talk.
              </p>
              <a
                href="mailto:hello@swarms.dev"
                className="group mt-4 inline-flex items-center text-sm font-medium text-neutral-950"
              >
                hello@swarms.dev
                <span className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>→</span>
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="h-full rounded-2xl border border-neutral-200 bg-white p-7">
              <p className="text-[15px] font-medium text-neutral-950">Read the source of truth</p>
              <p className="mt-2 text-[14px] leading-relaxed text-neutral-500">
                Our security model, trust boundaries, and money rules are written down and versioned
                — the same documents our own engineers are held to.
              </p>
              <Link href="/security" className="group mt-4 inline-flex items-center text-sm font-medium text-neutral-950">
                Security &amp; trust
                <span className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>→</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
