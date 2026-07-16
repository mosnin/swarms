"use client";

/**
 * The oversized clipped "swarms" wordmark, brought to life: letters rise in
 * with a soft stagger when the footer scrolls into view, and hovering sweeps
 * a violet→blue gradient across the word (background-clip text with a
 * transitioned background-position — no filters, no re-layout).
 */

import { motion } from "motion/react";

const LETTERS = "swarms".split("");
const EASE = [0.22, 1, 0.36, 1] as const;

export function FooterWordmark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative h-20 select-none overflow-hidden sm:h-28 md:h-32"
    >
      <p className="group pointer-events-auto absolute inset-x-0 top-0 whitespace-nowrap text-center font-display text-[16vw] font-semibold leading-none tracking-tighter sm:text-[11vw] md:text-[9vw]">
        {LETTERS.map((letter, i) => (
          <motion.span
            key={i}
            initial={{ y: "0.35em", opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.7, delay: i * 0.055, ease: EASE }}
            className="inline-block bg-clip-text text-transparent transition-[background-position] duration-700 ease-out"
            style={{
              backgroundImage:
                "linear-gradient(100deg, #fafafa 0%, #fafafa 42%, #c4b5fd 50%, #93c5fd 58%, #fafafa 66%, #fafafa 100%)",
              backgroundSize: "300% 100%",
              backgroundPosition: "100% 0",
            }}
            onMouseEnter={(e) => {
              // Sweep runs left→right across the whole word: stagger each
              // letter's transition-delay by index for a traveling highlight.
              const parent = e.currentTarget.parentElement;
              if (!parent) return;
              Array.from(parent.children).forEach((el, j) => {
                (el as HTMLElement).style.transitionDelay = `${j * 45}ms`;
                (el as HTMLElement).style.backgroundPosition = "0% 0";
              });
            }}
            onMouseLeave={(e) => {
              const parent = e.currentTarget.parentElement;
              if (!parent) return;
              Array.from(parent.children).forEach((el, j) => {
                (el as HTMLElement).style.transitionDelay = `${j * 30}ms`;
                (el as HTMLElement).style.backgroundPosition = "100% 0";
              });
            }}
          >
            {letter}
          </motion.span>
        ))}
      </p>
    </div>
  );
}
