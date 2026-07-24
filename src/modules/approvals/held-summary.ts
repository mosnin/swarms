/**
 * Pure summary of the spend an approver is holding: how many jobs wait and the
 * total estimated minor units at stake. Amounts are only summed within a single
 * currency (the first item's); mixed-currency totals are meaningless, so any
 * off-currency item is counted but excluded from the total.
 */

export interface HeldItem {
  costMinor: number;
  costCurrency: string;
}

export interface HeldSummary {
  count: number;
  totalMinor: number;
  currency: string;
}

export function summarizeHeld(items: HeldItem[]): HeldSummary {
  const currency = items[0]?.costCurrency ?? "USD";
  const totalMinor = items.reduce(
    (sum, item) => sum + (item.costCurrency === currency ? item.costMinor : 0),
    0,
  );
  return { count: items.length, totalMinor, currency };
}
