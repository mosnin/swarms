"use client";

/**
 * The storytelling system. Every feature and use-case page is composed from
 * these pieces so the whole site shares one rhythm:
 *
 * - StoryHero    — eyebrow pill, oversized mixed-weight headline, lede, CTAs.
 * - BigStatement — a manifesto line that lights up word by word as you scroll.
 * - Scene        — a time-stamped narrative beat ("6:04 AM — …") for painting
 *                  the picture of what you could do.
 * - SplitRow     — alternating explanation rows with a visual slot.
 * - Pull         — an oversized pull-quote with an accent rule.
 * - Em           — the emphasized clause inside quiet prose.
 *
 * Taste rules encoded here (not left to each page): 0.22,1,0.36,1 easing
 * everywhere, reveals rise 12–16px max, staggers 40–60ms, one accent per
 * page, prose is light-weight neutral-600 with medium neutral-950 emphasis.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionValueEvent, useScroll } from "motion/react";

import { Reveal } from "@/app/(marketing)/_components/reveal";
import { ACCENT, type Accent } from "@/app/(marketing)/_lib/site-map";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

export function StoryHero({
  accent,
  eyebrow,
  title,
  lede,
  primary = { href: "/login", label: "Get started" },
  secondary = { href: "/docs", label: "Read the docs" },
  children,
}: {
  accent: Accent;
  eyebrow: string;
  title: React.ReactNode;
  lede: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
      <div className="mx-auto max-w-3xl text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className={`inline-flex items-center gap-2 rounded-full ${a.bg} px-3.5 py-1.5 text-xs font-medium ${a.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
          {eyebrow}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.06, ease: EASE }}
          className="mt-6 font-display text-5xl font-light leading-[1.04] tracking-tight text-neutral-950 sm:text-6xl md:text-7xl"
        >
          {title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.14, ease: EASE }}
          className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-500"
        >
          {lede}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.22, ease: EASE }}
          className="mt-8 flex items-center justify-center gap-3"
        >
          <Link
            href={primary.href}
            className="group rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.97]"
          >
            {primary.label}
            <span className="ml-1.5 inline-block transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
              →
            </span>
          </Link>
          <Link
            href={secondary.href}
            className="rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            {secondary.label}
          </Link>
        </motion.div>
      </div>

      {children && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
          className="mt-16"
        >
          {children}
        </motion.div>
      )}
    </section>
  );
}

/** The gradient-emphasized fragment inside a hero title. */
export function TitleEm({ accent, children }: { accent: Accent; children: React.ReactNode }) {
  return (
    <span className={`bg-gradient-to-r ${ACCENT[accent].gradient} bg-clip-text font-semibold text-transparent`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* BigStatement — words light up as you scroll                          */
/* ------------------------------------------------------------------ */

export function BigStatement({ children, accentWords = [] }: { children: string; accentWords?: string[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const words = children.split(" ");
  const [lit, setLit] = useState(0);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "start 0.35"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setLit(Math.round(v * words.length));
  });

  return (
    <section ref={ref} className="mx-auto max-w-4xl px-6 py-24 sm:py-32">
      <p className="font-display text-3xl font-light leading-snug tracking-tight sm:text-4xl md:text-[2.75rem]">
        {words.map((word, i) => {
          const emphasized = accentWords.includes(word.replace(/[.,—]/g, ""));
          return (
            <span
              key={i}
              className={`transition-colors duration-300 ${
                i < lit ? (emphasized ? "font-medium text-neutral-950" : "text-neutral-950") : "text-neutral-300"
              }`}
            >
              {word}{" "}
            </span>
          );
        })}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Scene — a narrative beat                                            */
/* ------------------------------------------------------------------ */

export function Scene({
  accent,
  time,
  title,
  children,
  visual,
  flip = false,
}: {
  accent: Accent;
  time: string;
  title: string;
  children: React.ReactNode;
  visual?: React.ReactNode;
  flip?: boolean;
}) {
  const a = ACCENT[accent];
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <Reveal direction={flip ? "right" : "left"} className={flip ? "md:order-2" : ""}>
        <p className={`font-mono text-xs font-medium uppercase tracking-widest ${a.text}`}>{time}</p>
        <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
          {title}
        </h3>
        <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-neutral-500">{children}</div>
      </Reveal>
      {visual && (
        <Reveal direction={flip ? "left" : "right"} delay={0.08} className={flip ? "md:order-1" : ""}>
          {visual}
        </Reveal>
      )}
    </div>
  );
}

/** Wrapper giving scenes a shared vertical rhythm + connecting spine. */
export function SceneList({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-24 px-6 py-20 sm:space-y-32 sm:py-28">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* SplitRow — feature explanation                                      */
/* ------------------------------------------------------------------ */

export function SplitRow({
  eyebrow,
  accent,
  title,
  children,
  visual,
  flip = false,
}: {
  eyebrow?: string;
  accent: Accent;
  title: string;
  children: React.ReactNode;
  visual: React.ReactNode;
  flip?: boolean;
}) {
  const a = ACCENT[accent];
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <Reveal direction={flip ? "right" : "left"} className={flip ? "md:order-2" : ""}>
        {eyebrow && (
          <p className={`text-xs font-medium uppercase tracking-widest ${a.text}`}>{eyebrow}</p>
        )}
        <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
          {title}
        </h3>
        <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-neutral-500">{children}</div>
      </Reveal>
      <Reveal direction={flip ? "left" : "right"} delay={0.08} className={flip ? "md:order-1" : ""}>
        {visual}
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pull quote                                                          */
/* ------------------------------------------------------------------ */

export function Pull({ accent, children, attribution }: { accent: Accent; children: React.ReactNode; attribution?: string }) {
  const a = ACCENT[accent];
  return (
    <Reveal>
      <figure className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
        <div className={`mx-auto mb-8 h-10 w-px bg-gradient-to-b ${a.gradient}`} aria-hidden />
        <blockquote className="font-display text-2xl font-light leading-snug tracking-tight text-neutral-950 sm:text-3xl">
          {children}
        </blockquote>
        {attribution && <figcaption className="mt-6 text-sm text-neutral-400">{attribution}</figcaption>}
      </figure>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Emphasized clause inside quiet prose. */
export function Em({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-neutral-950">{children}</span>;
}

/** A checked point in a benefits list. */
export function Point({ accent, title, children }: { accent: Accent; title: string; children: React.ReactNode }) {
  const a = ACCENT[accent];
  return (
    <div className="group">
      <div className="flex items-center gap-2.5">
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${a.bg} ${a.text}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <p className="text-[15px] font-medium text-neutral-950">{title}</p>
      </div>
      <p className="mt-1.5 pl-[30px] text-[15px] leading-relaxed text-neutral-500">{children}</p>
    </div>
  );
}

/** Terminal-style code pane for feature pages. */
export function CodePane({ label, children }: { label: string; children: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-950 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.35)]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[11px] text-neutral-500">{label}</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-neutral-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}
