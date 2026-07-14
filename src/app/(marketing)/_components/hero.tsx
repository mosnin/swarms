"use client";

import Link from "next/link";
import { motion } from "motion/react";

import { Aurora } from "@/app/(marketing)/_components/aurora";
import { LiveConsole } from "@/app/(marketing)/_components/live-console";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-20 sm:pt-28">
      <Aurora />

      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-7 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-3.5 py-1.5 text-[13px] font-medium text-neutral-600 shadow-sm backdrop-blur"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
          </span>
          Agent Capability Cloud
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.05, ease: EASE }}
          className="text-balance text-[2.75rem] font-light leading-[1.02] tracking-tight text-neutral-950 sm:text-6xl md:text-7xl"
        >
          One API.
          <br />
          <span className="bg-gradient-to-r from-violet-600 via-violet-500 to-blue-500 bg-clip-text font-semibold text-transparent">
            Unlimited agents.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.15, ease: EASE }}
          className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-neutral-500"
        >
          Your agent spawns a fleet of sandboxed workers, simulates its ICP, schedules the boring parts,
          and grades its own output — billed to the GPU-second, under a budget it can never exceed.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.25, ease: EASE }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 text-sm font-medium text-white shadow-[0_1px_1px_rgb(0_0_0/0.1),0_12px_24px_-8px_rgb(0_0_0/0.35)] transition-transform active:scale-[0.97]"
          >
            Get started free
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <Link
            href="/docs"
            className="rounded-full border border-neutral-200 bg-white px-6 py-3 text-sm font-medium text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 active:scale-[0.97]"
          >
            Read the docs
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-4 text-xs text-neutral-400"
        >
          No credit card to start · Pay only for GPU-seconds used
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.35, ease: EASE }}
        className="mx-auto mt-16 flex max-w-5xl justify-center px-4"
      >
        <LiveConsole />
      </motion.div>
    </section>
  );
}
