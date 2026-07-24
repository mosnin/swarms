import type { Metadata } from "next";
import Link from "next/link";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import { StoryHero, TitleEm } from "@/app/(marketing)/_components/story";

export const metadata: Metadata = {
  title: "Status — Swarms",
  description: "Live operational status of the Swarms platform.",
};

const COMPONENTS = [
  { name: "API", note: "Spawn, swarms, hosted agents, billing" },
  { name: "Dashboard", note: "The web console" },
  { name: "Worker fleet", note: "Job execution and scheduled runs" },
  { name: "Webhooks", note: "Signed outbound delivery" },
  { name: "Documentation", note: "Docs and quickstart" },
];

function OperationalPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Operational
    </span>
  );
}

export default function StatusPage() {
  return (
    <main className="bg-white">
      <div className="relative overflow-hidden">
        <Aurora />
        <StoryHero
          accent="emerald"
          eyebrow="Status"
          title={
            <>
              All systems
              <br />
              <TitleEm accent="emerald">operational.</TitleEm>
            </>
          }
          lede="An honest, eyes-on-glass view of the platform. When something breaks, this is where it shows first."
          primary={{ href: "/docs", label: "Read the docs" }}
          secondary={{ href: "/security", label: "Security" }}
        />
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-16">
        <Reveal>
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            <RevealGroup className="divide-y divide-neutral-100" stagger={0.05}>
              {COMPONENTS.map((c) => (
                <div key={c.name} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="text-[15px] font-medium text-neutral-950">{c.name}</p>
                    <p className="mt-0.5 text-[13px] text-neutral-500">{c.note}</p>
                  </div>
                  <OperationalPill />
                </div>
              ))}
            </RevealGroup>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <p className="mt-6 text-[13px] leading-relaxed text-neutral-400">
            This page reflects a manual operational check. A live, automated status history with
            incident timelines is on the way. In the meantime, if you are seeing something we are
            not, tell us — that is the fastest fix.
          </p>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6">
            <p className="text-[15px] font-medium text-neutral-950">Report an incident</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-500">
              Reach a human directly, and read how we think about trust and isolation.
            </p>
            <div className="mt-4 flex flex-wrap gap-4">
              <a href="mailto:hello@swarms.dev" className="group inline-flex items-center text-sm font-medium text-neutral-950">
                hello@swarms.dev
                <span className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>→</span>
              </a>
              <Link href="/security" className="group inline-flex items-center text-sm font-medium text-neutral-950">
                Security &amp; trust
                <span className="ml-1 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
