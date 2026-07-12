/**
 * Minimal, dependency-free 5-field cron evaluator (UTC).
 *
 *   ┌───────── minute        (0-59)
 *   │ ┌─────── hour          (0-23)
 *   │ │ ┌───── day-of-month  (1-31)
 *   │ │ │ ┌─── month         (1-12)
 *   │ │ │ │ ┌─ day-of-week   (0-6, Sun=0; 7 also accepted as Sun)
 *   * * * * *
 *
 * Supports `*`, `a`, `a-b`, `a-b/n`, `*​/n`, and comma lists of those. Matching
 * follows the standard Vixie-cron rule: when BOTH day-of-month and day-of-week
 * are restricted (neither is `*`), a day matches if EITHER field matches; if one
 * is `*`, both must match.
 *
 * `nextRun` steps minute-by-minute (bounded to ~366 days) — simple and provably
 * correct, and it only runs on schedule create / fire, never in a hot path.
 */

export interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

const RANGES: Record<string, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  dow: [0, 6],
};

function parseField(field: string, kind: keyof typeof RANGES): Set<number> {
  const [min, max] = RANGES[kind]!;
  const out = new Set<number>();
  for (const partRaw of field.split(",")) {
    const part = partRaw.trim();
    if (part.length === 0) throw new Error(`Empty term in cron field "${field}"`);

    let step = 1;
    let rangePart = part;
    const slash = part.indexOf("/");
    if (slash !== -1) {
      rangePart = part.slice(0, slash);
      const stepStr = part.slice(slash + 1);
      step = Number(stepStr);
      if (!Number.isInteger(step) || step <= 0) throw new Error(`Invalid step "${stepStr}" in "${field}"`);
    }

    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = min;
      hi = max;
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-");
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(rangePart);
      hi = lo;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`Invalid number in cron field "${field}"`);

    // Day-of-week 7 is a synonym for Sunday (0).
    if (kind === "dow") {
      if (lo === 7) lo = 0;
      if (hi === 7) hi = 0;
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`Cron field "${field}" out of range [${min}-${max}]`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parse + validate a 5-field cron expression. Throws on malformed input. */
export function parseCron(expr: string): CronFields {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron expression must have exactly 5 fields (got ${fields.length}): "${expr}"`);
  }
  const [minute, hour, dom, month, dow] = fields as [string, string, string, string, string];
  return {
    minutes: parseField(minute, "minute"),
    hours: parseField(hour, "hour"),
    daysOfMonth: parseField(dom, "dom"),
    months: parseField(month, "month"),
    daysOfWeek: parseField(dow, "dow"),
    domRestricted: dom.trim() !== "*",
    dowRestricted: dow.trim() !== "*",
  };
}

/** Whether the expression is valid. */
export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

function matches(fields: CronFields, d: Date): boolean {
  if (!fields.minutes.has(d.getUTCMinutes())) return false;
  if (!fields.hours.has(d.getUTCHours())) return false;
  if (!fields.months.has(d.getUTCMonth() + 1)) return false;

  const domOk = fields.daysOfMonth.has(d.getUTCDate());
  const dowOk = fields.daysOfWeek.has(d.getUTCDay());
  // Vixie rule: both restricted → OR; otherwise → AND.
  if (fields.domRestricted && fields.dowRestricted) return domOk || dowOk;
  return domOk && dowOk;
}

const MAX_LOOKAHEAD_MINUTES = 366 * 24 * 60;

/**
 * Next UTC firing strictly after `after`. Returns null if nothing matches within
 * ~366 days (an unsatisfiable expression, e.g. Feb 30).
 */
export function nextRun(exprOrFields: string | CronFields, after: Date): Date | null {
  const fields = typeof exprOrFields === "string" ? parseCron(exprOrFields) : exprOrFields;
  // Start at the next whole minute after `after` (seconds/ms zeroed).
  const d = new Date(after);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);

  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i++) {
    if (matches(fields, d)) return d;
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}
