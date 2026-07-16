"use client";

/**
 * Animated visual vignettes for feature and use-case pages. Each one is a
 * small, honest illustration of a real product mechanic — not decoration.
 * All loop only while in view, respect one shared frame style, and use the
 * same easing family as the rest of the site.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";

import { TiltCard } from "@/app/(marketing)/_components/tilt-card";
import { ACCENT, type Accent } from "@/app/(marketing)/_lib/site-map";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Accent glow colors for the frame corner — pre-faded gradients, no filter. */
const GLOW: Record<Accent, string> = {
  violet: "rgb(139 92 246 / 0.14)",
  blue: "rgb(59 130 246 / 0.14)",
  emerald: "rgb(16 185 129 / 0.14)",
  amber: "rgb(245 158 11 / 0.14)",
  rose: "rgb(244 63 94 / 0.14)",
  cyan: "rgb(6 182 212 / 0.14)",
};

function VisualFrame({ accent, children, label }: { accent: Accent; children: React.ReactNode; label?: string }) {
  return (
    <TiltCard>
      <div className={`relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 p-6 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_50px_-24px_rgb(0_0_0/0.15)] sm:p-8`}>
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full"
          style={{ background: `radial-gradient(closest-side, ${GLOW[accent]}, transparent 72%)` }}
          aria-hidden
        />
        {label && <p className="relative mb-5 font-mono text-[11px] uppercase tracking-widest text-neutral-400">{label}</p>}
        <div className="relative">{children}</div>
      </div>
    </TiltCard>
  );
}

/** Loop helper: advances `phase` 0..(n-1) on an interval while in view. */
function usePhase(steps: number, ms: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % steps), ms);
    return () => clearInterval(t);
  }, [inView, steps, ms]);
  return { ref, phase, inView };
}

/* ------------------------------------------------------------------ */
/* Fan-out: one request becomes many workers becomes one answer.       */
/* ------------------------------------------------------------------ */

export function FanOutVisual({ accent = "blue" as Accent }) {
  const { ref, phase } = usePhase(4, 1600);
  const a = ACCENT[accent];
  const workers = ["research", "draft", "fact-check", "pricing"];
  return (
    <div ref={ref}>
      <VisualFrame accent={accent} label="one call · four workers · one answer">
        <div className="flex items-center justify-between gap-3">
          <div className={`rounded-lg ${a.bg} px-3 py-2 font-mono text-[11px] font-medium ${a.text}`}>you</div>
          <div className="flex-1 space-y-2">
            {workers.map((w, i) => (
              <motion.div
                key={w}
                animate={{
                  opacity: phase >= 1 ? 1 : 0.25,
                  x: phase >= 1 ? 0 : -6,
                  scale: phase === 2 && i % 2 === 0 ? 1.02 : 1,
                }}
                transition={{ duration: 0.4, delay: i * 0.06, ease: EASE }}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${phase >= 2 ? "bg-emerald-500" : a.dot} transition-colors duration-300`} />
                <span className="font-mono text-[11px] text-neutral-600">{w}</span>
                <span className="ml-auto font-mono text-[10px] text-neutral-400">
                  {phase < 2 ? "running" : "done"}
                </span>
              </motion.div>
            ))}
          </div>
          <motion.div
            animate={{ opacity: phase === 3 ? 1 : 0.25, scale: phase === 3 ? 1 : 0.96 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="rounded-lg bg-neutral-950 px-3 py-2 font-mono text-[11px] font-medium text-white"
          >
            merged
          </motion.div>
        </div>
      </VisualFrame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ceiling: spend climbs, hits the cap, is stopped — every time.       */
/* ------------------------------------------------------------------ */

export function CeilingVisual({ accent = "amber" as Accent }) {
  const { ref, phase } = usePhase(3, 1800);
  const a = ACCENT[accent];
  const pct = phase === 0 ? 34 : phase === 1 ? 78 : 100;
  return (
    <div ref={ref}>
      <VisualFrame accent={accent} label="budgetUsd: 3.00 — a physical ceiling">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-neutral-950">
            ${((pct / 100) * 3).toFixed(2)}
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              key={phase}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={`font-mono text-[11px] font-medium ${phase === 2 ? "text-rose-600" : "text-neutral-400"}`}
            >
              {phase === 2 ? "ceiling reached — worker stopped" : "metering GPU-seconds…"}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-neutral-100">
          <motion.div
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: EASE }}
            className={`h-full rounded-full bg-gradient-to-r ${phase === 2 ? "from-rose-500 to-rose-600" : a.gradient}`}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-neutral-400">
          <span>$0.00</span>
          <span className={phase === 2 ? "font-semibold text-rose-600" : ""}>$3.00 hard cap</span>
        </div>
      </VisualFrame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inbox wake: message in → agent wakes → replies → sleeps.            */
/* ------------------------------------------------------------------ */

export function InboxWakeVisual({ accent = "emerald" as Accent }) {
  const { ref, phase } = usePhase(4, 1700);
  const a = ACCENT[accent];
  const states = ["idle — costing nothing", "message received", "awake — running task", "replied — asleep again"];
  return (
    <div ref={ref}>
      <VisualFrame accent={accent} label="a persistent agent's afternoon">
        <div className="flex items-center gap-4">
          <motion.div
            animate={{
              scale: phase === 2 ? 1.06 : 1,
              boxShadow: phase === 2 ? "0 0 0 6px rgb(16 185 129 / 0.12)" : "0 0 0 0px rgb(16 185 129 / 0)",
            }}
            transition={{ duration: 0.5, ease: EASE }}
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${a.bg}`}
          >
            <motion.span
              animate={{ opacity: phase === 0 || phase === 3 ? 0.35 : 1 }}
              className={`text-xl ${a.text}`}
              aria-hidden
            >
              ◉
            </motion.span>
          </motion.div>
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.p
                key={phase}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="text-sm font-medium text-neutral-950"
              >
                {states[phase]}
              </motion.p>
            </AnimatePresence>
            <div className="mt-2 flex gap-1">
              {states.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= phase ? a.dot : "bg-neutral-100"}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <AnimatePresence mode="wait">
            <motion.p
              key={phase < 2 ? "q" : "a"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="font-mono text-[12px] text-neutral-600"
            >
              {phase < 2 ? "→ “what changed in our competitors' pricing this week?”" : "← “Two of five moved. Full brief attached. Cost: $0.11.”"}
            </motion.p>
          </AnimatePresence>
        </div>
      </VisualFrame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Approval gate: risky action pauses until a human says go.           */
/* ------------------------------------------------------------------ */

export function ApprovalVisual({ accent = "rose" as Accent }) {
  const { ref, phase } = usePhase(3, 1900);
  const a = ACCENT[accent];
  return (
    <div ref={ref}>
      <VisualFrame accent={accent} label="policy: external writes require approval">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5">
            <span className="font-mono text-[11px] text-neutral-600">agent requests: send 240 emails via connector</span>
          </div>
          <motion.div
            animate={{ opacity: phase >= 1 ? 1 : 0.3, y: phase >= 1 ? 0 : 4 }}
            transition={{ duration: 0.4, ease: EASE }}
            className={`flex items-center gap-2.5 rounded-lg ${a.bg} px-3.5 py-2.5`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${a.dot} ${phase === 1 ? "animate-pulse" : ""}`} />
            <span className={`font-mono text-[11px] font-medium ${a.text}`}>
              {phase < 2 ? "held for approval — nothing sent" : "approved by dana@ — released"}
            </span>
          </motion.div>
          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.25, y: phase === 2 ? 0 : 4 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="font-mono text-[11px] text-neutral-600">executed · logged to the audit trail</span>
          </motion.div>
        </div>
      </VisualFrame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schedule: cron ticks turning into runs.                             */
/* ------------------------------------------------------------------ */

export function ScheduleVisual({ accent = "cyan" as Accent }) {
  const { ref, phase } = usePhase(4, 1400);
  const a = ACCENT[accent];
  const runs = ["Mon 06:00", "Tue 06:00", "Wed 06:00", "Thu 06:00"];
  return (
    <div ref={ref}>
      <VisualFrame accent={accent} label='schedule: "0 6 * * *" — the morning report'>
        <div className="grid grid-cols-4 gap-2.5">
          {runs.map((r, i) => (
            <motion.div
              key={r}
              animate={{
                opacity: i <= phase ? 1 : 0.3,
                y: i <= phase ? 0 : 6,
              }}
              transition={{ duration: 0.45, ease: EASE }}
              className="rounded-xl border border-neutral-200 bg-white p-3 text-center"
            >
              <p className="font-mono text-[10px] text-neutral-400">{r}</p>
              <p className={`mt-1.5 text-lg ${i <= phase ? "text-emerald-500" : "text-neutral-200"}`} aria-hidden>
                ✓
              </p>
              <p className={`font-mono text-[10px] ${i <= phase ? a.text : "text-neutral-300"}`}>$0.14</p>
            </motion.div>
          ))}
        </div>
      </VisualFrame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ledger: append-only rows.                                           */
/* ------------------------------------------------------------------ */

export function LedgerVisual({ accent = "amber" as Accent }) {
  const { ref, phase } = usePhase(4, 1500);
  const rows = [
    { kind: "hold", amount: "−$3.00", note: "reserved before the run" },
    { kind: "charge", amount: "−$0.86", note: "43 GPU-seconds metered" },
    { kind: "release", amount: "+$2.14", note: "unused hold returned" },
    { kind: "receipt", amount: "·", note: "signed, immutable, yours" },
  ];
  return (
    <div ref={ref}>
      <VisualFrame accent={accent} label="the ledger never lies — append-only">
        <div className="space-y-2">
          {rows.map((row, i) => (
            <motion.div
              key={row.kind}
              animate={{ opacity: i <= phase ? 1 : 0.2, x: i <= phase ? 0 : -8 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3.5 py-2"
            >
              <span className="font-mono text-[11px] font-medium text-neutral-950">{row.kind}</span>
              <span className="font-mono text-[11px] text-neutral-400">{row.note}</span>
              <span className={`font-mono text-[11px] font-semibold tabular-nums ${row.amount.startsWith("+") ? "text-emerald-600" : "text-neutral-950"}`}>
                {row.amount}
              </span>
            </motion.div>
          ))}
        </div>
      </VisualFrame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Extraction: chaos in, table out.                                    */
/* ------------------------------------------------------------------ */

export function ExtractionVisual({ accent = "emerald" as Accent }) {
  const { ref, phase } = usePhase(3, 1700);
  const a = ACCENT[accent];
  return (
    <div ref={ref}>
      <VisualFrame accent={accent} label="10,000 PDFs → one clean table">
        <div className="flex items-center gap-4">
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <motion.div
                key={i}
                animate={{ opacity: phase >= 1 ? 0.25 : 0.9, scale: phase >= 1 ? 0.94 : 1 }}
                transition={{ duration: 0.5, delay: i * 0.03, ease: EASE }}
                className="h-7 rounded-md border border-neutral-200 bg-white"
                style={{ transform: `rotate(${((i * 7) % 5) - 2}deg)` }}
              />
            ))}
          </div>
          <motion.span animate={{ opacity: phase >= 1 ? 1 : 0.3 }} className={`text-lg ${a.text}`} aria-hidden>
            →
          </motion.span>
          <div className="flex-1 space-y-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <motion.div
                key={i}
                animate={{ opacity: phase === 2 ? 1 : 0.15, x: phase === 2 ? 0 : 6 }}
                transition={{ duration: 0.45, delay: i * 0.07, ease: EASE }}
                className="flex h-6 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
                <span className="h-1.5 flex-1 rounded-full bg-neutral-100" />
                <span className="h-1.5 w-8 rounded-full bg-neutral-100" />
              </motion.div>
            ))}
          </div>
        </div>
      </VisualFrame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Personas: a simulated focus group reacting.                         */
/* ------------------------------------------------------------------ */

export function PersonasVisual({ accent = "rose" as Accent }) {
  const { ref, phase } = usePhase(3, 1800);
  const a = ACCENT[accent];
  const personas = [
    { name: "price-sensitive parent", verdict: "“$29 feels steep without a trial.”" },
    { name: "startup founder", verdict: "“Would pay double for the API alone.”" },
    { name: "enterprise buyer", verdict: "“Needs SSO before I can even pilot it.”" },
  ];
  return (
    <div ref={ref}>
      <VisualFrame accent={accent} label="32 personas · one pricing page · 90 seconds">
        <div className="space-y-2">
          {personas.map((p, i) => (
            <motion.div
              key={p.name}
              animate={{ opacity: i <= phase ? 1 : 0.25, y: i <= phase ? 0 : 5 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5"
            >
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${a.bg} font-mono text-[10px] font-semibold ${a.text}`}>
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-[10px] uppercase tracking-wide text-neutral-400">{p.name}</span>
                <span className="text-[13px] text-neutral-700">{p.verdict}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </VisualFrame>
    </div>
  );
}
