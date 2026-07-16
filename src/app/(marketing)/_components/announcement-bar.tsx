"use client";

/**
 * Slim announcement bar above the nav. Two messages roll vertically on a
 * relaxed cadence; a soft gradient shimmer sweeps the strip; dismissing it
 * collapses the height smoothly and is remembered per announcement key (bump
 * STORAGE_KEY when the campaign changes to bring the bar back for everyone).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

const STORAGE_KEY = "swarms:announce:hosted-agents";
const ROTATE_MS = 6000;

const MESSAGES = [
  {
    href: "/features/hosted-agents",
    chip: "New",
    text: "Hosted agents — deploy a persistent Hermes agent in one click",
  },
  {
    href: "/pricing",
    chip: "$0.02/s",
    text: "Metered to the GPU-second, under a ceiling you set",
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function AnnouncementBar() {
  // Start hidden to avoid a dismiss-flash for returning visitors; reveal after
  // the localStorage check. The height animates in, so the late reveal reads
  // as intentional rather than as layout shift.
  const [state, setState] = useState<"unknown" | "shown" | "dismissed">("unknown");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    try {
      setState(localStorage.getItem(STORAGE_KEY) === "1" ? "dismissed" : "shown");
    } catch {
      setState("shown");
    }
  }, []);

  useEffect(() => {
    if (state !== "shown") return;
    const t = setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [state]);

  function dismiss() {
    setState("dismissed");
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  const message = MESSAGES[index]!;

  return (
    <AnimatePresence initial={false}>
      {state === "shown" && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="relative overflow-hidden"
        >
          <div className="relative border-b border-violet-100/80 bg-gradient-to-r from-violet-50 via-blue-50/70 to-violet-50">
            {/* Traveling sheen — background-position on a small strip, cheap. */}
            <div
              aria-hidden
              className="animate-shimmer pointer-events-none absolute inset-0 opacity-60"
              style={{ animationDuration: "7s" }}
            />
            <div className="relative mx-auto flex h-9 max-w-5xl items-center justify-center gap-2 px-10 sm:px-12">
              <AnimatePresence mode="wait">
                <motion.div
                  key={index}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -12, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="min-w-0"
                >
                  <Link
                    href={message.href}
                    className="group flex items-center gap-2 text-[13px] text-neutral-600 transition-colors hover:text-neutral-950"
                  >
                    <span className="shrink-0 rounded-full bg-violet-600/10 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                      {message.chip}
                    </span>
                    <span className="truncate font-medium">{message.text}</span>
                    <span
                      className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden
                    >
                      →
                    </span>
                  </Link>
                </motion.div>
              </AnimatePresence>

              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss announcement"
                className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/70 hover:text-neutral-700"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3 w-3" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
