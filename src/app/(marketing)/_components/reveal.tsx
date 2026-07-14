"use client";

import { Children } from "react";
import { motion, type Variants } from "motion/react";

type Direction = "up" | "down" | "left" | "right" | "none";

const OFFSETS: Record<Direction, { x?: number; y?: number }> = {
  up: { y: 22 },
  down: { y: -22 },
  left: { x: 22 },
  right: { x: -22 },
  none: {},
};

/**
 * Fades + rises an element into place the first time it scrolls into view.
 * One shared primitive so every section animates with the same feel instead of
 * bespoke one-off transitions per component.
 */
export function Reveal({
  children,
  className,
  direction = "up",
  delay = 0,
  duration = 0.6,
  as: Component = "div",
}: {
  children: React.ReactNode;
  className?: string;
  direction?: Direction;
  delay?: number;
  duration?: number;
  as?: "div" | "span" | "li";
}) {
  const offset = OFFSETS[direction];
  const variants: Variants = {
    hidden: { opacity: 0, ...offset },
    visible: { opacity: 1, x: 0, y: 0 },
  };

  const MotionComponent = MOTION_TAGS[Component];

  return (
    <MotionComponent
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      variants={variants}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionComponent>
  );
}

const MOTION_TAGS = { div: motion.div, span: motion.span, li: motion.li };

/**
 * Applies a staggered Reveal to each direct child — wrap a row of cards/stats
 * in this instead of hand-rolling per-item delays.
 */
export function RevealGroup({
  children,
  className,
  stagger = 0.08,
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  direction?: Direction;
}) {
  const offset = OFFSETS[direction];
  const container: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: stagger } },
  };
  const item: Variants = {
    hidden: { opacity: 0, ...offset },
    visible: { opacity: 1, x: 0, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      variants={container}
    >
      {Children.map(children, (child, i) => (
        <motion.div key={i} variants={item}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
