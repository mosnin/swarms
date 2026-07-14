"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";

type Phase = "request" | "dispatch" | "settled";

const WORKERS = ["research", "draft", "pricing"];
const WORKER_STAGGER_MS = 550;
const HOLD_SETTLED_MS = 3200;

/**
 * The hero's centerpiece: a floating panel that plays out one real Swarms call
 * end to end — a request body, the fan-out to workers, and a metered, merged
 * result — looping gently so the page always feels alive. This is the literal
 * mechanic of POST /api/v1/swarms, not a decorative mockup.
 */
export function LiveConsole() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-15% 0px -15% 0px" });
  const [phase, setPhase] = useState<Phase>("request");
  const [litWorkers, setLitWorkers] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fn: () => void) => {
      if (cancelled) return;
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    };

    const runCycle = () => {
      setPhase("request");
      setLitWorkers(0);
      after(1100, () => setPhase("dispatch"));
      WORKERS.forEach((_, i) => after(1500 + i * WORKER_STAGGER_MS, () => setLitWorkers(i + 1)));
      const settleAt = 1500 + WORKERS.length * WORKER_STAGGER_MS + 500;
      after(settleAt, () => setPhase("settled"));
      after(settleAt + HOLD_SETTLED_MS, runCycle);
    };
    runCycle();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [inView]);

  return (
    <div
      ref={ref}
      className="animate-float relative w-full max-w-xl overflow-hidden rounded-[28px] border border-neutral-200/80 bg-white/90 shadow-[0_1px_1px_rgb(0_0_0/0.03),0_30px_70px_-30px_rgb(80_50_180/0.25)] backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-neutral-100 px-5 py-3.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="font-mono text-[12px] tracking-tight text-neutral-500">POST /api/v1/swarms</span>
      </div>

      <div className="p-5">
        {/* Request body */}
        <pre className="overflow-x-auto rounded-xl bg-neutral-50 p-4 font-mono text-[12.5px] leading-relaxed text-neutral-500">
          <code>
            <span className="text-neutral-400">{"{"}</span>
            {"\n  "}
            <span className="text-violet-600">&quot;tasks&quot;</span>: [<span className="text-emerald-600">&quot;research&quot;</span>,{" "}
            <span className="text-emerald-600">&quot;draft&quot;</span>, <span className="text-emerald-600">&quot;pricing&quot;</span>],
            {"\n  "}
            <span className="text-violet-600">&quot;budgetUsd&quot;</span>: <span className="text-blue-600">3.00</span>
            {"\n"}
            <span className="text-neutral-400">{"}"}</span>
          </code>
        </pre>

        {/* Fan-out diagram */}
        <div className="mt-5 flex items-center justify-between px-1">
          <Node label="you" lit filled />
          <Connector lit={phase !== "request"} />
          <div className="flex flex-col gap-3">
            {WORKERS.map((w, i) => (
              <div key={w} className="flex items-center gap-2">
                <Connector lit={litWorkers > i} short />
                <Node label={w} lit={litWorkers > i} />
              </div>
            ))}
          </div>
          <Connector lit={phase === "settled"} />
          <Node label="merged" lit={phase === "settled"} filled />
        </div>

        {/* Response line */}
        <div className="mt-5 h-6 font-mono text-[12.5px]">
          <AnimatePresence mode="wait">
            {phase === "request" && (
              <motion.p key="req" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-neutral-400">
                awaiting request…
              </motion.p>
            )}
            {phase === "dispatch" && (
              <motion.p key="dispatch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-amber-600">
                → 202 queued · dispatching {WORKERS.length} workers…
              </motion.p>
            )}
            {phase === "settled" && (
              <motion.p key="settled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-emerald-600">
                → 200 succeeded · <span className="tabular-nums">$0.14</span> · 3 workers merged
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Node({ label, lit, filled = false }: { label: string; lit: boolean; filled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.span
        animate={{
          backgroundColor: lit ? (filled ? "#7c3aed" : "#ede9fe") : "#f5f5f4",
          scale: lit ? 1 : 0.85,
        }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={`h-3 w-3 rounded-full ring-4 ${lit ? "ring-violet-100" : "ring-transparent"}`}
      />
      <span className="font-mono text-[10px] text-neutral-400">{label}</span>
    </div>
  );
}

function Connector({ lit, short = false }: { lit: boolean; short?: boolean }) {
  return (
    <div className={`relative ${short ? "h-px w-5" : "h-px flex-1"} mx-1.5 overflow-hidden rounded-full bg-neutral-100`}>
      <motion.div
        className="absolute inset-y-0 left-0 bg-violet-400"
        initial={{ width: "0%" }}
        animate={{ width: lit ? "100%" : "0%" }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
    </div>
  );
}
