"use client";

import { useEffect, useState } from "react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

import { Reveal } from "@/app/(marketing)/_components/reveal";

const ROWS = [
  {
    tag: "Budgets",
    title: "A budget is physics, not a policy.",
    body: "Set a budgetUsd on any job, swarm, or simulation and it becomes a hard GPU-time ceiling — reserved atomically before a single worker runs. There is no code path where an agent spends past it.",
    tint: "from-violet-50/80",
    visual: <BudgetGauge />,
  },
  {
    tag: "Ledger",
    title: "Every charge, to the cent, forever.",
    body: "Integer minor-units on an append-only ledger — holds, charges, and releases you can reconcile line by line. Nothing is ever rewritten, only appended.",
    tint: "from-blue-50/80",
    visual: <LedgerTicker />,
  },
  {
    tag: "Interface",
    title: "It runs headless — API or MCP, your call.",
    body: "No browser, no human in the loop. Point an OpenAI-style tool call or a plain HTTP request at the same execution spine and get back a signed, metered result.",
    tint: "from-emerald-50/80",
    visual: <HeadlessToggle />,
  },
  {
    tag: "Simulations",
    title: "Simulate your ICP before you ship.",
    body: "Spin up a crew of skeptical personas that debate your positioning in one sandbox — parallel research panels or a collaborative roundtable, priced per persona.",
    tint: "from-rose-50/70",
    visual: <PersonaChat />,
  },
] as const;

export function CapabilityRows() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium tracking-wide text-violet-600">How it holds together</p>
        <h2 className="mt-3 text-balance text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl">
          Built like infrastructure, not a toy.
        </h2>
      </Reveal>

      <div className="mt-16 space-y-6">
        {ROWS.map((row, i) => (
          <Reveal key={row.title} direction={i % 2 === 0 ? "left" : "right"} className="w-full">
            <div
              className={`grid items-center gap-10 rounded-[28px] bg-gradient-to-br ${row.tint} to-white p-8 sm:p-12 md:grid-cols-2 md:gap-16`}
            >
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <span className="font-mono text-xs font-medium uppercase tracking-widest text-neutral-400">
                  {row.tag}
                </span>
                <h3 className="mt-3 text-balance text-2xl font-medium tracking-tight text-neutral-950 sm:text-3xl">
                  {row.title}
                </h3>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-neutral-500">{row.body}</p>
              </div>
              <div className={i % 2 === 1 ? "md:order-1" : ""}>{row.visual}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------- inline visuals ---------------------------- */

function VisualCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-20% 0px -20% 0px" });
  return (
    <div
      ref={ref}
      className="mx-auto flex h-56 w-full max-w-sm items-center justify-center rounded-2xl border border-white bg-white/70 shadow-[0_1px_1px_rgb(0_0_0/0.02),0_20px_45px_-24px_rgb(0_0_0/0.15)] backdrop-blur"
    >
      {inView ? children : <div className="h-full w-full" />}
    </div>
  );
}

function BudgetGauge() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setBlocked((b) => !b), 3200);
    return () => clearInterval(t);
  }, []);
  const pct = blocked ? 100 : 78;
  const circumference = 2 * Math.PI * 42;

  return (
    <VisualCard>
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-28 w-28">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#f4f4f5" strokeWidth="8" />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={blocked ? "#f43f5e" : "#8b5cf6"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset: circumference - (pct / 100) * circumference }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-lg font-semibold tabular-nums text-neutral-800">{pct}%</span>
          </div>
        </div>
        <motion.span
          animate={{ opacity: blocked ? 1 : 0 }}
          className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-500"
        >
          ceiling reached — blocked
        </motion.span>
      </div>
    </VisualCard>
  );
}

const LEDGER_ROWS = [
  { kind: "hold", amount: -0.3 },
  { kind: "charge", amount: -0.14 },
  { kind: "release", amount: 0.16 },
];

function LedgerTicker() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v + 1) % (LEDGER_ROWS.length + 1)), 1300);
    return () => clearInterval(t);
  }, []);
  const total = LEDGER_ROWS.slice(0, n).reduce((a, r) => a + r.amount, 0);

  return (
    <VisualCard>
      <div className="w-full max-w-[15rem] font-mono text-xs">
        <div className="space-y-1.5">
          {LEDGER_ROWS.map((r, i) => (
            <motion.div
              key={r.kind + i}
              animate={{ opacity: i < n ? 1 : 0.25, x: i < n ? 0 : -4 }}
              className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5"
            >
              <span className="text-neutral-400">{r.kind}</span>
              <span className={r.amount < 0 ? "text-neutral-700" : "text-emerald-600"}>
                {r.amount > 0 ? "+" : ""}
                {r.amount.toFixed(2)}
              </span>
            </motion.div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2.5">
          <span className="text-neutral-400">balance</span>
          <span className="tabular-nums text-neutral-900">${(1.0 + total).toFixed(2)}</span>
        </div>
      </div>
    </VisualCard>
  );
}

function HeadlessToggle() {
  const [i, setI] = useState(0);
  const modes = ["POST /api/v1/spawn", "tools/call → spawn_agent"] as const;
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % modes.length), 2200);
    return () => clearInterval(t);
  }, [modes.length]);

  return (
    <VisualCard>
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2 rounded-full bg-neutral-100 p-1">
          {["API", "MCP"].map((label, idx) => (
            <span
              key={label}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                i === idx ? "bg-neutral-950 text-white" : "text-neutral-400"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg bg-neutral-50 px-3 py-2 font-mono text-[11px] text-neutral-500"
        >
          {modes[i]}
        </motion.p>
      </div>
    </VisualCard>
  );
}

const PERSONAS = [
  { name: "Skeptical CFO", line: "What's the ROI here?" },
  { name: "Eager PM", line: "This ships our Q3 metric." },
];

function PersonaChat() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % PERSONAS.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <VisualCard>
      <div className="w-full max-w-[15rem] space-y-2.5">
        {PERSONAS.map((p, idx) => (
          <motion.div
            key={p.name}
            animate={{ opacity: idx === i ? 1 : 0.35, scale: idx === i ? 1 : 0.97 }}
            transition={{ duration: 0.35 }}
            className="rounded-2xl border border-neutral-100 bg-white px-3.5 py-2.5 shadow-sm"
          >
            <p className="text-[11px] font-medium text-neutral-800">{p.name}</p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{p.line}</p>
          </motion.div>
        ))}
      </div>
    </VisualCard>
  );
}
