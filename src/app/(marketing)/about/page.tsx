import type { Metadata } from "next";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { CtaBand } from "@/app/(marketing)/_components/cta-band";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";

export const metadata: Metadata = { title: "About — Swarms" };

const VALUES = [
  {
    n: "01",
    title: "Compute is rented, not owned",
    body: "By the second, bounded by a hard ceiling. An agent should never need to trust a human to watch the meter.",
  },
  {
    n: "02",
    title: "Money is integer minor-units",
    body: "On an append-only ledger, reconcilable to the cent. Floating point has no place near a bill.",
  },
  {
    n: "03",
    title: "Untrusted work stays sandboxed",
    body: "It never touches the control plane. Isolation is structural, not a policy someone can forget to enable.",
  },
  {
    n: "04",
    title: "It runs headless",
    body: "An agent calling an API or MCP tool — no human required, no browser in the loop.",
  },
] as const;

export default function AboutPage() {
  return (
    <main className="bg-white">
      <section className="relative overflow-hidden px-6 pb-16 pt-20 sm:pt-24">
        <Aurora className="opacity-60" />
        <Reveal className="mx-auto max-w-3xl">
          <p className="text-sm font-medium tracking-wide text-violet-600">About</p>
          <h1 className="mt-3 text-balance text-4xl font-light leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl">
            The execution layer for <span className="font-semibold">autonomous agents.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-500">
            Agents are getting good at deciding <em className="text-neutral-700">what</em> to do. The missing
            piece is a safe, metered, accountable place to actually <em className="text-neutral-700">do</em> it —
            at scale, with real money on the line. That&apos;s Swarms.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-16">
        <RevealGroup className="grid gap-px overflow-hidden rounded-3xl border border-neutral-100 bg-neutral-100 sm:grid-cols-2" stagger={0.08}>
          {VALUES.map((v) => (
            <div key={v.n} className="bg-white p-8">
              <span className="font-display text-3xl font-light text-neutral-200">{v.n}</span>
              <h3 className="mt-3 text-lg font-medium tracking-tight text-neutral-900">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{v.body}</p>
            </div>
          ))}
        </RevealGroup>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <Reveal>
          <blockquote className="text-balance font-display text-2xl font-light leading-snug tracking-tight text-neutral-800 sm:text-3xl">
            Think of it as the cloud primitives — compute, identity, billing, audit — reimagined for a world
            where the customer is <span className="font-semibold text-violet-600">an autonomous agent</span>,
            not a person clicking a dashboard.
          </blockquote>
        </Reveal>
      </section>

      <CtaBand />
    </main>
  );
}
