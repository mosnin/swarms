"use client";

/**
 * Magnetic wrapper: the child leans a few pixels toward the cursor while
 * hovered and springs home on leave. Motion values only — no re-renders —
 * and a hard 7px travel cap keeps it a lean, not a chase. Touch ignored.
 */

import { motion, useMotionValue, useSpring } from "motion/react";

const MAX_TRAVEL = 7;
const SPRING = { stiffness: 260, damping: 18, mass: 0.5 };

export function Magnetic({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const x = useSpring(useMotionValue(0), SPRING);
  const y = useSpring(useMotionValue(0), SPRING);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(relX * 2 * MAX_TRAVEL);
    y.set(relY * 2 * MAX_TRAVEL);
  }

  function onPointerLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{ x, y, willChange: "transform" }}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.div>
  );
}
