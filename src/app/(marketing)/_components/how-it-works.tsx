"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";

import { Reveal } from "@/app/(marketing)/_components/reveal";

const STEPS = [
  {
    n: "01",
    title: "Point your agent at the API",
    body: "One POST /api/v1/swarms with your tasks, a budget in dollars, and any resources to inherit — secrets, files, MCP tools, context.",
  },
  {
    n: "02",
    title: "We spawn & meter the fleet",
    body: "Sandboxed workers run on rented GPU, each bounded by its slice of the budget. You get a run id back instantly — the fleet runs off your request thread.",
  },
  {
    n: "03",
    title: "Collect the merged result",
    body: "Poll, stream over SSE, or get a signed webhook when it's done — with a full cost breakdown and an append-only audit trail.",
  },
] as const;

const WORKER_COUNT = 4;

export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (v < 0.34) setActive(0);
    else if (v < 0.67) setActive(1);
    else setActive(2);
  });

  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium tracking-wide text-violet-600">Three steps to a workforce</p>
        <h2 className="mt-3 text-balance text-3xl font-medium tracking-tight text-neutral-950 sm:text-4xl">
          From request to merged result.
        </h2>
      </Reveal>

      {/* Shorter scroll runway on narrow viewports: the steps stack above the
          diagram there instead of pairing side by side, so less scroll
          distance is needed to scrub through all three. */}
      <div ref={sectionRef} className="relative mt-16 h-[130vh] md:h-[230vh]">
        <div className="sticky top-24 grid gap-14 md:grid-cols-2 md:items-center">
          {/* Steps */}
          <div className="space-y-3">
            {STEPS.map((step, i) => (
              <div
                key={step.n}
                className="rounded-2xl border p-6 transition-all duration-500"
                style={{
                  borderColor: active === i ? "#ddd6fe" : "transparent",
                  backgroundColor: active === i ? "#faf9ff" : "transparent",
                  opacity: active === i ? 1 : 0.4,
                  transform: active === i ? "scale(1)" : "scale(0.98)",
                }}
              >
                <span
                  className={`font-mono text-xs font-medium ${active === i ? "text-violet-500" : "text-neutral-400"}`}
                >
                  {step.n}
                </span>
                <h3 className="mt-1.5 text-lg font-medium tracking-tight text-neutral-900">{step.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-500">{step.body}</p>
              </div>
            ))}
          </div>

          {/* Diagram */}
          <div className="flex h-[22rem] items-center justify-center rounded-[28px] border border-neutral-100 bg-gradient-to-br from-neutral-50 to-white">
            <FanOutDiagram step={active} />
          </div>
        </div>
      </div>
    </section>
  );
}

function FanOutDiagram({ step }: { step: number }) {
  const workers = Array.from({ length: WORKER_COUNT });

  return (
    <svg viewBox="0 0 320 260" className="h-64 w-72">
      {/* connectors: director -> workers */}
      {workers.map((_, i) => {
        const y = 40 + i * 60;
        return (
          <motion.line
            key={`in-${i}`}
            x1={70}
            y1={130}
            x2={160}
            y2={y}
            stroke="#c4b5fd"
            strokeWidth={1.5}
            animate={{ opacity: step >= 1 ? 1 : 0.15 }}
            transition={{ duration: 0.4 }}
          />
        );
      })}
      {/* connectors: workers -> merge */}
      {workers.map((_, i) => {
        const y = 40 + i * 60;
        return (
          <motion.line
            key={`out-${i}`}
            x1={180}
            y1={y}
            x2={260}
            y2={130}
            stroke="#c4b5fd"
            strokeWidth={1.5}
            animate={{ opacity: step >= 2 ? 1 : 0.15 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          />
        );
      })}

      {/* director node */}
      <motion.circle
        cx={70}
        cy={130}
        r={13}
        fill="#7c3aed"
        animate={{ scale: step >= 0 ? 1 : 0.8 }}
        transition={{ duration: 0.4 }}
      />
      <text x={70} y={165} textAnchor="middle" className="fill-neutral-400 font-mono text-[10px]">
        you
      </text>

      {/* worker nodes */}
      {workers.map((_, i) => {
        const y = 40 + i * 60;
        return (
          <g key={`w-${i}`}>
            <motion.circle
              cx={170}
              cy={y}
              r={10}
              fill={step >= 1 ? "#7c3aed" : "#e4e4e7"}
              animate={{ scale: step >= 1 ? 1 : 0.8 }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
            />
          </g>
        );
      })}

      {/* merge node */}
      <motion.circle
        cx={260}
        cy={130}
        r={15}
        fill={step >= 2 ? "#7c3aed" : "#e4e4e7"}
        animate={{ scale: step >= 2 ? 1 : 0.8 }}
        transition={{ duration: 0.4 }}
      />
      <text x={260} y={168} textAnchor="middle" className="fill-neutral-400 font-mono text-[10px]">
        merged
      </text>
    </svg>
  );
}
