"use client";

import { MotionConfig } from "motion/react";

/**
 * Site-wide motion policy: honor the visitor's prefers-reduced-motion setting
 * for every framer-driven animation (the CSS keyframes are already covered by
 * the global reduced-motion media query).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
