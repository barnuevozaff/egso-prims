import { formatPHP } from "@/lib/format";
import type {
  AccountComparison,
  AccountRollup,
  ComparisonStatus,
  OverallComparison,
  SubmeterComparison,
  WaterAccount,
  WaterBill,
  WaterMeterReading,
  WaterSubmeter,
  WaterSubmeterBill,
} from "@/features/water/types";
import {
  classifyMovement as classify,
  previousPeriod,
  trailingPeriods,
} from "@/features/shared/periods";

// Re-exported so existing imports from this module keep working unchanged.
export { previousPeriod, trailingPeriods };

const amountFor = (bills: WaterBill[], accountId: string, month: number, year: number) =>
  bills.find(
    (b) => b.accountId === accountId && b.billingMonth === month && b.billingYear === year,
  )?.amount ?? null;

/**
 * Month-over-month movement per account for the selected period. Accounts
 * without a bill for either month still appear, with null amounts.
 */
export function buildComparisons(
  accounts: WaterAccount[],
  bills: WaterBill[],
  month: number,
  year: number,
): AccountComparison[] {
  const prev = previousPeriod(month, year);
  return accounts.map((account) => {
    const current = amountFor(bills, account.id, month, year);
    const previous = amountFor(bills, account.id, prev.month, prev.year);
    const difference = current !== null && previous !== null ? current - previous : 0;
    const percent =
      current !== null && previous !== null && previous !== 0 ? (difference / previous) * 100 : null;
    return {
      account,
      current,
      previous,
      difference,
      percent,
      status: classify(current, previous),
    };
  });
}

/** Combined movement across every account for the selected period. */
export function buildOverall(comparisons: AccountComparison[]): OverallComparison {
  const currentTotal = comparisons.reduce((s, c) => s + (c.current ?? 0), 0);
  const previousTotal = comparisons.reduce((s, c) => s + (c.previous ?? 0), 0);
  const difference = currentTotal - previousTotal;
  const percent = previousTotal !== 0 ? (difference / previousTotal) * 100 : null;
  return {
    currentTotal,
    previousTotal,
    difference,
    percent,
    status: classify(currentTotal, previousTotal || null),
    increased: comparisons.filter((c) => c.status === "Increased").length,
    decreased: comparisons.filter((c) => c.status === "Decreased").length,
    unchanged: comparisons.filter((c) => c.status === "No Change").length,
    accounts: comparisons.length,
  };
}

/** "▲ Increased by ₱650 (12.5%)" — the spec's comparison phrasing. */
export function comparisonLabel(
  status: ComparisonStatus,
  difference: number,
  percent: number | null,
): string {
  if (status === "No Change") return "No Change";
  const arrow = status === "Increased" ? "▲" : "▼";
  const pct = percent === null ? "" : ` (${Math.abs(percent).toFixed(2)}%)`;
  return `${arrow} ${status} by ${formatPHP(Math.abs(difference))}${pct}`;
}

/** Sentence used for the overall banner. */
export function overallLabel(overall: OverallComparison): string {
  // Nothing recorded for the month reads as "unchanged" otherwise, which a
  // reader takes as a month that was billed at last month's level.
  if (overall.currentTotal === 0) return "No water bills recorded for this month yet";
  if (overall.status === "No Change") return "Overall Water Consumption unchanged";
  const arrow = overall.status === "Increased" ? "▲" : "▼";
  const pct = overall.percent === null ? "" : ` (${Math.abs(overall.percent).toFixed(2)}%)`;
  return `${arrow} Overall Water Consumption ${overall.status} by ${formatPHP(
    Math.abs(overall.difference),
  )}${pct}`;
}

/** Combined expense per period, for the monthly trend chart. */
export function monthlyTotals(
  bills: WaterBill[],
  periods: { month: number; year: number }[],
): number[] {
  return periods.map((p) =>
    bills
      .filter((b) => b.billingMonth === p.month && b.billingYear === p.year)
      .reduce((s, b) => s + b.amount, 0),
  );
}

/** Distinct locations across accounts, for the location filter. */
export function accountLocations(accounts: WaterAccount[]): string[] {
  return [...new Set(accounts.map((a) => a.location))].sort();
}

/** Distinct billing years present in the data, newest first. */
export function billingYears(bills: WaterBill[]): number[] {
  const years = [...new Set(bills.map((b) => b.billingYear))].sort((a, b) => b - a);
  return years.length > 0 ? years : [new Date().getFullYear()];
}

export const accountLabel = (a: WaterAccount) => a.accountName || a.accountNumber;

/* ---------------- submeters ---------------- */

const submeterBillFor = (
  bills: WaterSubmeterBill[],
  submeterId: string,
  month: number,
  year: number,
) =>
  bills.find(
    (b) => b.submeterId === submeterId && b.billingMonth === month && b.billingYear === year,
  ) ?? null;

/**
 * Month-over-month movement per submeter for the selected period. Submeters
 * without a bill for either month still appear, with null amounts.
 */
export function buildSubmeterComparisons(
  submeters: WaterSubmeter[],
  bills: WaterSubmeterBill[],
  month: number,
  year: number,
): SubmeterComparison[] {
  const prev = previousPeriod(month, year);
  return submeters.map((submeter) => {
    const cur = submeterBillFor(bills, submeter.id, month, year);
    const pre = submeterBillFor(bills, submeter.id, prev.month, prev.year);
    const current = cur?.amount ?? null;
    const previous = pre?.amount ?? null;
    const difference = current !== null && previous !== null ? current - previous : 0;
    const percent =
      current !== null && previous !== null && previous !== 0 ? (difference / previous) * 100 : null;
    return {
      submeter,
      current,
      previous,
      currentConsumption: cur?.consumption ?? 0,
      difference,
      percent,
      status: classify(current, previous),
    };
  });
}

/** Submeters belonging to one account. */
export const submetersOf = (submeters: WaterSubmeter[], accountId: string) =>
  submeters.filter((s) => s.accountId === accountId);

/** Most recent billing record for a submeter, newest period first. */
export function latestSubmeterBill(
  bills: WaterSubmeterBill[],
  submeterId: string,
): WaterSubmeterBill | null {
  const own = bills
    .filter((b) => b.submeterId === submeterId)
    .sort((a, b) => b.billingYear * 12 + b.billingMonth - (a.billingYear * 12 + a.billingMonth));
  return own[0] ?? null;
}

/**
 * Rolls an account's submeters up into the account total for the period.
 * Only Active submeters contribute to the live totals; archived ones keep
 * their history for reporting.
 */
export function accountRollup(
  submeters: WaterSubmeter[],
  bills: WaterSubmeterBill[],
  accountId: string,
  month: number,
  year: number,
): AccountRollup {
  const own = submetersOf(submeters, accountId);
  const active = own.filter((s) => s.status === "Active");
  const rows = active
    .map((s) => submeterBillFor(bills, s.id, month, year))
    .filter((b): b is WaterSubmeterBill => b !== null);
  return {
    totalAmount: rows.reduce((s, b) => s + b.amount, 0),
    totalConsumption: rows.reduce((s, b) => s + b.consumption, 0),
    activeSubmeters: active.length,
    totalSubmeters: own.length,
  };
}

export const submeterLabel = (s: WaterSubmeter) => s.submeterName || s.submeterNumber;

/* ---------------- meter readings ---------------- */

/** Readings for one submeter, newest reading date first. */
export function readingsOf(
  readings: WaterMeterReading[],
  submeterId: string,
): WaterMeterReading[] {
  return readings
    .filter((r) => r.submeterId === submeterId)
    .sort((a, b) => b.readingDate.localeCompare(a.readingDate));
}

/**
 * The reading a new entry continues from. Its current reading becomes the
 * next entry's previous reading, so the meter index never has to be retyped.
 */
export function latestReading(
  readings: WaterMeterReading[],
  submeterId: string,
): WaterMeterReading | null {
  return readingsOf(readings, submeterId)[0] ?? null;
}

/** Consumption a submeter's readings record for one billing period. */
export function meteredConsumption(
  readings: WaterMeterReading[],
  submeterId: string,
  month: number,
  year: number,
): number | null {
  const rows = readings.filter((r) => {
    if (r.submeterId !== submeterId) return false;
    const d = new Date(r.readingDate);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });
  return rows.length === 0 ? null : rows.reduce((s, r) => s + r.consumption, 0);
}
