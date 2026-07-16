import { Reveal } from "@/app/(marketing)/_components/reveal";

/**
 * Honest comparison: Swarms vs the three ways teams actually buy agent
 * compute today. Alternative figures are public list prices (mid-2026) for
 * representative products/instances; the point is the shape of the deal,
 * not dunking on anyone.
 */

const COLUMNS = [
  {
    name: "Swarms",
    sub: "metered agent labor",
    highlight: true,
    rows: [
      "$0 — agents cost nothing between runs",
      "Per GPU-second ($0.02) + 20% fee",
      "Hard ceiling — worker stopped at the cap",
      "Append-only ledger, receipt per run",
      "One API call",
    ],
  },
  {
    name: "Hosted agent platforms",
    sub: "always-on deployments",
    highlight: false,
    rows: [
      "~$155/mo standby per production deployment*",
      "Per node executed + uptime meter",
      "Soft alerts; the meter keeps running",
      "Traces, but no money-grade ledger",
      "Deploy pipeline + platform seats",
    ],
  },
  {
    name: "Per-task agent products",
    sub: "block-priced sessions",
    highlight: false,
    rows: [
      "Subscription floor even when unused",
      "~$2.25 per ~15-minute work block*",
      "Blocks round up; caps are monthly, not per-task",
      "Session logs",
      "Per-seat product onboarding",
    ],
  },
  {
    name: "DIY on raw cloud GPUs",
    sub: "build it yourself",
    highlight: false,
    rows: [
      "~$3.95/hr per H100 — working or not*",
      "Per instance-hour, always",
      "Whatever you build (so: nothing, at first)",
      "Whatever you build",
      "Queue, sandbox, ledger, budgets — months",
    ],
  },
] as const;

const ROW_LABELS = ["Idle cost", "Billing granularity", "Overspend protection", "Financial audit trail", "Time to first result"];

export function Comparison() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The honest comparison</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
          Pay for work, not for waiting.
        </h2>
        <p className="mt-4 text-neutral-500">
          Every other way to buy agent compute bills you for existence — standby fees, session
          blocks, idle instances. Swarms bills for seconds worked, under a ceiling you set.
        </p>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="w-full min-w-[760px] border-collapse bg-white text-left">
            <thead>
              <tr>
                <th className="w-44 border-b border-neutral-200 p-4" aria-label="Criteria" />
                {COLUMNS.map((c) => (
                  <th
                    key={c.name}
                    className={`border-b p-4 align-bottom ${
                      c.highlight ? "border-violet-200 bg-violet-50/60" : "border-neutral-200"
                    }`}
                  >
                    <p className={`text-[15px] font-semibold ${c.highlight ? "text-violet-700" : "text-neutral-950"}`}>
                      {c.name}
                    </p>
                    <p className="mt-0.5 text-xs font-normal text-neutral-400">{c.sub}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROW_LABELS.map((label, r) => (
                <tr key={label} className="group">
                  <td className="border-b border-neutral-100 p-4 text-[13px] font-medium text-neutral-500">
                    {label}
                  </td>
                  {COLUMNS.map((c) => (
                    <td
                      key={c.name}
                      className={`border-b p-4 text-[13px] leading-snug ${
                        c.highlight
                          ? "border-violet-100 bg-violet-50/60 font-medium text-neutral-950"
                          : "border-neutral-100 text-neutral-500"
                      }`}
                    >
                      {c.rows[r]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-400">
          *Representative public list prices as of mid-2026 for comparable products and on-demand
          H100 instances; shapes shown are typical for each category.
        </p>
      </Reveal>

      {/* What that means in dollars — story math */}
      <Reveal delay={0.15}>
        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {[
            ["A six-thread diligence memo", "$3.61", "28 minutes, aggregated, with a bear case. An analyst-week costs four figures and arrives Friday."],
            ["An overnight ops agent", "< $2/mo idle", "Wakes on alerts, files the morning report. Pays for seconds awake — sleeping is free."],
            ["A 32-persona focus group", "≈ $9", "Every segment reacts to your pricing page before you ship it. A real panel costs thousands and takes weeks."],
          ].map(([title, price, body]) => (
            <div key={title as string} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-neutral-950">{price}</p>
              <p className="mt-1 text-[14px] font-medium text-neutral-950">{title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{body}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
