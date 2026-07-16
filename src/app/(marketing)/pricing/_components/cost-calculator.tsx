"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";

// Mirrors the real defaults in src/lib/env.ts: GPU_RATE_MINOR_PER_SECOND=2
// ($0.02/GPU-second) and PLATFORM_FEE_BPS=2000 (20%) — this calculator is the
// actual pricing formula, not an illustrative guess.
const RATE_PER_SECOND = 0.02;
const PLATFORM_FEE = 0.2;

export function CostCalculator() {
  const [workers, setWorkers] = useState(4);
  const [seconds, setSeconds] = useState(45);

  const { compute, fee, total } = useMemo(() => {
    const computeCost = workers * seconds * RATE_PER_SECOND;
    const feeCost = computeCost * PLATFORM_FEE;
    return { compute: computeCost, fee: feeCost, total: computeCost + feeCost };
  }, [workers, seconds]);

  const computePct = (compute / total) * 100 || 0;

  return (
    <div className="rounded-[28px] border border-neutral-100 bg-white p-8 shadow-[0_1px_1px_rgb(0_0_0/0.02),0_30px_60px_-30px_rgb(0_0_0/0.15)] sm:p-10">
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <div className="space-y-8">
          <Slider label="Workers per swarm" value={workers} onChange={setWorkers} min={1} max={16} unit="" />
          <Slider label="GPU-seconds per worker" value={seconds} onChange={setSeconds} min={5} max={120} unit="s" />
          <p className="text-xs leading-relaxed text-neutral-400">
            $0.02 / GPU-second, 20% platform fee on metered usage — the real formula behind every run.
          </p>
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-sm text-neutral-400">Estimated cost</p>
          <motion.p
            key={total.toFixed(2)}
            initial={{ opacity: 0.4, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="font-display text-5xl font-semibold tabular-nums tracking-tight text-neutral-950"
          >
            ${total.toFixed(2)}
          </motion.p>

          <div className="mt-6 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
              animate={{ width: `${computePct}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
          <div className="mt-3 flex justify-between text-xs text-neutral-400">
            <span>Compute · ${compute.toFixed(2)}</span>
            <span>Platform fee · ${fee.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="font-mono tabular-nums text-neutral-400">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-100 accent-violet-600"
      />
    </div>
  );
}
