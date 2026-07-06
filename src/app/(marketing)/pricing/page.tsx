import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pricing — Swarms" };

const check = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden>
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
      "Parallel + sequential swarms",
      "Signed webhooks & live streaming",
      "Scoped API keys with per-key budgets",
      "Connectors (MCP tools)",
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
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-8 pt-16 sm:pt-20">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Simple, usage-based pricing</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          You rent GPU by the second and pay for exactly what your agents use. A budget is a hard
          ceiling — you can never be surprised by the bill.
        </p>
      </div>

      <div className="mt-14 grid items-start gap-5 md:grid-cols-3">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={
              t.highlight
                ? "relative rounded-3xl border-2 border-primary bg-background p-7 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.25)]"
                : "rounded-3xl border bg-background p-7 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
            }
          >
            {t.highlight && (
              <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                Most popular
              </span>
            )}
            <h2 className="font-semibold">{t.name}</h2>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">{t.price}</span>
              <span className="text-sm text-muted-foreground">{t.unit}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t.blurb}</p>
            <Link
              href={t.name === "Enterprise" ? "/about" : "/login"}
              className={
                t.highlight
                  ? "mt-6 flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
                  : "mt-6 flex w-full items-center justify-center rounded-full border bg-background px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-muted active:scale-[0.98]"
              }
            >
              {t.cta}
            </Link>
            <ul className="mt-6 space-y-2.5">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-sm text-muted-foreground">
                  {check}
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-muted-foreground">
        GPU-seconds are billed in integer minor units with an append-only ledger and exactly-once
        charging. Set a <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">budgetUsd</code> on
        any run and the platform physically cannot exceed it.
      </p>
    </main>
  );
}
