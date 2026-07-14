import Link from "next/link";
import type { Metadata } from "next";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { Reveal, RevealGroup } from "@/app/(marketing)/_components/reveal";
import { CostCalculator } from "@/app/(marketing)/pricing/_components/cost-calculator";

export const metadata: Metadata = { title: "Pricing — Swarms" };

const check = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const TIERS = [
  {
    name: "Starter",
    price: "$0",
    unit: "to begin",
    blurb: "Everything you need to spawn your first swarm.",
    cta: "Get started",
    highlight: false,
    features: [
      "Pay only for GPU-seconds used",
      "Up to 16 workers per swarm",
      "Hard budget ceilings",
      "API + MCP access",
      "Full audit trail",
    ],
  },
  {
    name: "Pay-as-you-go",
    price: "Metered",
    unit: "per GPU-second",
    blurb: "Rent compute by the second. A flat platform fee on top.",
    cta: "Start building",
    highlight: true,
    features: [
      "Everything in Starter",
      "20% platform fee on metered usage",
      "Parallel, sequential & DAG swarms",
      "Simulations, schedules & evaluations",
      "Signed webhooks & live streaming",
      "Scoped API keys with per-key budgets",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    unit: "annual",
    blurb: "For teams putting production agents behind real budgets.",
    cta: "Contact sales",
    highlight: false,
    features: [
      "Volume compute discounts",
      "SSO / SAML & SCIM",
      "Dedicated sandbox capacity",
      "Priority support & SLA",
      "Custom policies & approvals",
    ],
  },
] as const;

export default function PricingPage() {
  return (
    <main className="bg-white">
      <section className="relative overflow-hidden px-6 pb-8 pt-20 sm:pt-24">
        <Aurora className="opacity-70" />
        <Reveal className="mx-auto max-w-2xl text-center">
          <h1 className="text-balance text-4xl font-light tracking-tight text-neutral-950 sm:text-5xl">
            Simple, <span className="font-semibold">usage-based</span> pricing.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-500">
            You rent GPU by the second and pay for exactly what your agents use. A budget is a hard
            ceiling — you can never be surprised by the bill.
          </p>
        </Reveal>
      </section>

      <section className="px-6 pb-8">
        <Reveal className="mx-auto max-w-3xl">
          <CostCalculator />
        </Reveal>
      </section>

      <section className="px-6 py-20">
        <RevealGroup className="mx-auto grid max-w-5xl items-start gap-5 md:grid-cols-3" stagger={0.1}>
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={
                t.highlight
                  ? "relative rounded-[28px] border-2 border-violet-500 bg-white p-7 shadow-[0_30px_60px_-30px_rgb(124_58_237/0.35)]"
                  : "rounded-[28px] border border-neutral-100 bg-white p-7 shadow-[0_1px_2px_rgb(0_0_0/0.03)]"
              }
            >
              {t.highlight && (
                <span className="absolute -top-3 left-7 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white">
                  Most popular
                </span>
              )}
              <h2 className="font-medium tracking-tight text-neutral-950">{t.name}</h2>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-semibold tracking-tight text-neutral-950">
                  {t.price}
                </span>
                <span className="text-sm text-neutral-400">{t.unit}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-500">{t.blurb}</p>
              <Link
                href={t.name === "Enterprise" ? "/about" : "/login"}
                className={
                  t.highlight
                    ? "mt-6 flex w-full items-center justify-center rounded-full bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.98]"
                    : "mt-6 flex w-full items-center justify-center rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 active:scale-[0.98]"
                }
              >
                {t.cta}
              </Link>
              <ul className="mt-6 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-neutral-500">
                    {check}
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </RevealGroup>
      </section>

      <Reveal className="mx-auto max-w-2xl px-6 pb-24 text-center">
        <p className="text-sm text-neutral-400">
          GPU-seconds are billed in integer minor units with an append-only ledger and exactly-once
          charging. Set a <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[13px] text-neutral-600">budgetUsd</code> on
          any run and the platform physically cannot exceed it.
        </p>
      </Reveal>
    </main>
  );
}
