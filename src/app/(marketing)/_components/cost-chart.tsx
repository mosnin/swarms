"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";

import { Counter } from "@/app/(marketing)/_components/counter";
import { Reveal } from "@/app/(marketing)/_components/reveal";

// Cumulative spend across a sequence of runs against a fixed $3.00 budget
// ceiling — the shape a real swarm's ledger produces: spend rises, slows as
// workers settle, and asymptotes toward — but structurally cannot cross —
// the reservation. Illustrative values; the mechanic (hard ceiling, atomic
// reservation) is real.
const CEILING = 3.0;
const SPEND = [0, 0.42, 0.88, 1.3, 1.68, 2.02, 2.31, 2.54, 2.71, 2.83, 2.9];

const W = 640;
const H = 280;
const PAD_X = 20;
const PAD_Y = 24;

function scaleX(i: number) {
  return PAD_X + (i / (SPEND.length - 1)) * (W - PAD_X * 2);
}
function scaleY(v: number) {
  return H - PAD_Y - (v / (CEILING * 1.08)) * (H - PAD_Y * 2);
}

function linePath(values: number[]) {
  return values.map((v, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(v)}`).join(" ");
}

function areaPath(values: number[]) {
  const line = linePath(values);
  const last = values.length - 1;
  return `${line} L ${scaleX(last)} ${H - PAD_Y} L ${scaleX(0)} ${H - PAD_Y} Z`;
}

export function CostChart() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });
  const ceilingY = scaleY(CEILING);
  const line = linePath(SPEND);
  const area = areaPath(SPEND);
  const finalSpend = SPEND[SPEND.length - 1] ?? 0;

  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <div className="grid gap-12 md:grid-cols-2 md:items-center">
        <Reveal direction="right">
          <p className="text-sm font-medium tracking-wide text-violet-600">Metered to the cent</p>
          <h2 className="mt-3 text-balance text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl">
            Spend that stays inside the line.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-500">
            <span className="font-mono text-neutral-700">budgetUsd</span> reserves the ceiling atomically before
            any worker runs. Every hold, charge, and release lands in an append-only ledger — this is what a
            real swarm&apos;s cumulative spend looks like against its cap.
          </p>
          <div className="mt-8 flex items-center gap-8">
            <div>
              <p className="font-mono text-3xl font-semibold tabular-nums text-neutral-950">
                $<Counter value={finalSpend} decimals={2} />
              </p>
              <p className="mt-1 text-xs text-neutral-400">total spent</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-semibold tabular-nums text-neutral-300">
                ${CEILING.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-neutral-400">hard ceiling</p>
            </div>
          </div>
        </Reveal>

        <Reveal direction="left">
          <div ref={ref} className="rounded-[28px] border border-neutral-100 bg-white p-6 shadow-[0_1px_1px_rgb(0_0_0/0.02),0_30px_60px_-30px_rgb(0_0_0/0.15)]">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              <defs>
                <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* ceiling line */}
              <line
                x1={PAD_X}
                y1={ceilingY}
                x2={W - PAD_X}
                y2={ceilingY}
                stroke="#d4d4d8"
                strokeWidth={1.5}
                strokeDasharray="5 5"
              />
              <text x={W - PAD_X} y={ceilingY - 8} textAnchor="end" className="fill-neutral-400 font-mono text-[11px]">
                ${CEILING.toFixed(2)} ceiling
              </text>

              {/* area fill */}
              <motion.path
                d={area}
                fill="url(#spendFill)"
                initial={{ opacity: 0 }}
                animate={{ opacity: inView ? 1 : 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              />

              {/* spend line, drawn in */}
              <motion.path
                d={line}
                fill="none"
                stroke="#7c3aed"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: inView ? 1 : 0 }}
                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
              />

              {/* final point */}
              <motion.circle
                cx={scaleX(SPEND.length - 1)}
                cy={scaleY(finalSpend)}
                r={5}
                fill="#7c3aed"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                transition={{ delay: 1.3, duration: 0.35 }}
              />
            </svg>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
