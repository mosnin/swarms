/**
 * Time helpers. All timestamps are UTC. A {@link Clock} seam makes time
 * deterministic in tests — never call `Date.now()` directly in domain code.
 */

export interface Clock {
  /** Current wall-clock time. */
  now(): Date;
  /** Current epoch milliseconds. */
  epochMs(): number;
  /**
   * Monotonic high-resolution counter in milliseconds. Use for measuring
   * durations; it is not affected by wall-clock adjustments.
   */
  monotonicMs(): number;
}

/** Production clock backed by the system. */
export const systemClock: Clock = {
  now: () => new Date(),
  epochMs: () => Date.now(),
  monotonicMs: () => performance.now(),
};

/**
 * Deterministic clock for tests. Wall-clock and monotonic time can be advanced
 * independently.
 */
export function fixedClock(start: Date | number = 0): Clock & {
  advance(ms: number): void;
  set(time: Date | number): void;
} {
  let epoch = start instanceof Date ? start.getTime() : start;
  let mono = 0;
  return {
    now: () => new Date(epoch),
    epochMs: () => epoch,
    monotonicMs: () => mono,
    advance: (ms: number) => {
      epoch += ms;
      mono += ms;
    },
    set: (time: Date | number) => {
      epoch = time instanceof Date ? time.getTime() : time;
    },
  };
}

/** ISO-8601 string in UTC (e.g. `2026-06-20T12:00:00.000Z`). */
export function toIso(date: Date | number): string {
  return (date instanceof Date ? date : new Date(date)).toISOString();
}

/** Parse an ISO-8601 string, returning `null` when invalid. */
export function fromIso(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Convenience duration constants in milliseconds. */
export const Duration = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
} as const;

/** Whether `deadline` is at or before the clock's current time. */
export function isExpired(deadline: Date | number, clock: Clock = systemClock): boolean {
  const ms = deadline instanceof Date ? deadline.getTime() : deadline;
  return clock.epochMs() >= ms;
}
