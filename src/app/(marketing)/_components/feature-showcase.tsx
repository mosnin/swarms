"use client";

/**
 * The Apple-keynote feature list: a rail of features that advances itself —
 * each item's progress bar fills over ~5s, then the next item takes over and
 * the stage crossfades to its visual. Click (or focus + enter) any item to
 * jump. Pauses when off-screen and while hovered, honors reduced motion via
 * MotionConfig, and every animation is transform/opacity only.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useInView } from "motion/react";

import { FeatureIcon } from "@/app/(marketing)/_components/feature-icons";
import { OrbitVisual } from "@/app/(marketing)/_components/orbit-visual";
import {
  ApprovalVisual,
  CeilingVisual,
  FanOutVisual,
  InboxWakeVisual,
  ScheduleVisual,
} from "@/app/(marketing)/_components/visuals";
import { ACCENT, FEATURES } from "@/app/(marketing)/_lib/site-map";

const EASE = [0.22, 1, 0.36, 1] as const;
const STEP_MS = 5200;

/** Stage visual per feature slug. */
const STAGES: Record<string, React.ReactNode> = {
  spawn: <OrbitVisual accent="violet" />,
  swarms: <FanOutVisual accent="blue" />,
  "hosted-agents": <InboxWakeVisual accent="emerald" />,
  budgets: <CeilingVisual accent="amber" />,
  governance: <ApprovalVisual accent="rose" />,
  automation: <ScheduleVisual accent="cyan" />,
};

export function FeatureShowcase() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(sectionRef, { amount: 0.35 });
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  // Remount key for the progress bar so a manual jump restarts the fill.
  const [cycle, setCycle] = useState(0);

  const running = inView && !hovered;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => {
      setActive((i) => (i + 1) % FEATURES.length);
      setCycle((c) => c + 1);
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [running, active, cycle]);

  function jump(i: number) {
    setActive(i);
    setCycle((c) => c + 1);
  }

  const feature = FEATURES[active]!;

  return (
    <section ref={sectionRef} className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The platform</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
          Six primitives. One workforce.
        </h2>
      </div>

      <div
        className="mt-12 grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Rail */}
        <div role="tablist" aria-label="Platform features" className="space-y-1">
          {FEATURES.map((f, i) => {
            const a = ACCENT[f.accent];
            const isActive = i === active;
            return (
              <button
                key={f.slug}
                role="tab"
                aria-selected={isActive}
                onClick={() => jump(i)}
                className={`group relative w-full rounded-xl px-4 py-3 text-left transition-colors duration-200 ${
                  isActive ? "bg-neutral-50" : "hover:bg-neutral-50/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all duration-300 ${
                      isActive ? `${a.bg} ${a.text} scale-105` : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    <FeatureIcon slug={f.slug} className="h-4 w-4" />
                  </span>
                  <span className={`text-[15px] font-medium transition-colors duration-200 ${isActive ? "text-neutral-950" : "text-neutral-500"}`}>
                    {f.name}
                  </span>
                </div>

                {/* Expanding detail */}
                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="pb-1 pl-11 pt-2 text-[13.5px] leading-relaxed text-neutral-500">
                        {f.tagline}{" "}
                        <Link
                          href={f.href}
                          className={`font-medium ${a.text} underline-offset-4 hover:underline`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Learn more →
                        </Link>
                      </p>
                      {/* Progress bar for the auto-advance */}
                      <div className="ml-11 mt-2 h-0.5 overflow-hidden rounded-full bg-neutral-200/80">
                        <motion.div
                          key={cycle}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: running ? 1 : 0.35 }}
                          transition={running ? { duration: STEP_MS / 1000, ease: "linear" } : { duration: 0.3 }}
                          style={{ transformOrigin: "left", willChange: "transform" }}
                          className={`h-full rounded-full bg-gradient-to-r ${a.gradient}`}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>

        {/* Stage */}
        <div className="relative min-h-[320px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={feature.slug}
              initial={{ opacity: 0, y: 16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.99 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {STAGES[feature.slug]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
