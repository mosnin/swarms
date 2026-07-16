"use client";

/**
 * Pointer-tracked 3D tilt with a moving specular sheen — the Apple product-
 * card feel. Restraint is the taste: max ~4° of tilt, springs to settle, and
 * everything runs through motion values (zero React re-renders per frame).
 * Touch pointers are ignored; reduced-motion users get a static card via
 * MotionConfig.
 */

import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";

const SPRING = { stiffness: 260, damping: 24, mass: 0.6 };

export function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const rotateX = useSpring(useMotionValue(0), SPRING);
  const rotateY = useSpring(useMotionValue(0), SPRING);
  const sheenX = useSpring(useMotionValue(50), SPRING);
  const sheenY = useSpring(useMotionValue(50), SPRING);
  const sheenOpacity = useSpring(useMotionValue(0), SPRING);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 8); // ±4°
    rotateX.set((0.5 - py) * 8);
    sheenX.set(px * 100);
    sheenY.set(py * 100);
    sheenOpacity.set(1);
  }

  function onPointerLeave() {
    rotateX.set(0);
    rotateY.set(0);
    sheenOpacity.set(0);
  }

  const sheen = useMotionTemplate`radial-gradient(420px circle at ${sheenX}% ${sheenY}%, rgb(255 255 255 / 0.55), transparent 62%)`;

  return (
    <div style={{ perspective: 1000 }} className={className}>
      <motion.div
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d", willChange: "transform" }}
        className="relative"
      >
        {children}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ background: sheen, opacity: sheenOpacity }}
        />
      </motion.div>
    </div>
  );
}
