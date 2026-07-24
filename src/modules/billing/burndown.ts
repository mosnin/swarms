/**
 * Pure series-builder for the spend burn-down chart. Turns the ledger's daily
 * charges plus the current balance and burn rate into two dense series: the
 * historical daily spend (gap-filled) and a forward projection of the balance
 * depleting at the current rate until it hits zero — the visual runway. Kept
 * pure so the projection math is unit-testable without a chart or a clock.
 */

const DAY_MS = 86_400_000;
const MAX_PROJECTION_DAYS = 90;

export interface BurndownInput {
  byDay: Array<{ date: string; spentMinor: number }>;
  balanceMinor: number;
  dailyBurnMinor: number;
  windowDays: number;
  /** Today as yyyy-mm-dd (UTC). */
  todayIso: string;
}

export interface BurndownSeries {
  /** Dense daily spend, exactly `windowDays` long, ending today. */
  history: Array<{ date: string; spentMinor: number }>;
  /** Balance projected forward at the current burn rate until it reaches zero. */
  projection: Array<{ date: string; balanceMinor: number }>;
  /** Whole days of runway at the current burn, or null when burn is zero. */
  runwayDays: number | null;
  maxSpendMinor: number;
  startBalanceMinor: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function buildBurndown(input: BurndownInput): BurndownSeries {
  const today = parseDay(input.todayIso);
  const spentByDate = new Map(input.byDay.map((d) => [d.date, d.spentMinor]));

  const window = Math.max(1, Math.floor(input.windowDays));
  const history: Array<{ date: string; spentMinor: number }> = [];
  for (let i = window - 1; i >= 0; i -= 1) {
    const date = isoDay(new Date(today.getTime() - i * DAY_MS));
    history.push({ date, spentMinor: spentByDate.get(date) ?? 0 });
  }
  const maxSpendMinor = history.reduce((a, h) => Math.max(a, h.spentMinor), 0);

  const burn = Math.max(0, Math.floor(input.dailyBurnMinor));
  const balance = Math.max(0, Math.floor(input.balanceMinor));
  const runwayDays = burn > 0 ? Math.floor(balance / burn) : null;

  const projection: Array<{ date: string; balanceMinor: number }> = [
    { date: isoDay(today), balanceMinor: balance },
  ];
  if (burn > 0 && runwayDays !== null) {
    const days = Math.min(runwayDays, MAX_PROJECTION_DAYS);
    for (let i = 1; i <= days; i += 1) {
      projection.push({
        date: isoDay(new Date(today.getTime() + i * DAY_MS)),
        balanceMinor: Math.max(0, balance - i * burn),
      });
    }
  }

  return { history, projection, runwayDays, maxSpendMinor, startBalanceMinor: balance };
}
