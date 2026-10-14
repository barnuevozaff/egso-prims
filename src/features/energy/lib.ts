import { formatPHP } from "@/lib/format";
import type {
  AccountComparison,
  AccountRollup,
  ComparisonStatus,
  EnergyAccount,
  EnergyBill,
  EnergySubmeter,
  EnergySubmeterBill,
  OverallComparison,
  SubmeterComparison,
} from "@/features/energy/types";
import {
  classifyMovement as classify,
  previousPeriod,
  trailingPeriods,
} from "@/features/shared/periods";

// Re-exported so existing imports from this module keep working unchanged.
export { previousPeriod, trailingPeriods };

const amountFor = (bills: EnergyBill[], accountId: string, month: number, year: number) =>
  bills.find(
    (b) => b.accountId === accountId && b.billingMonth === month && b.billingYear === year,
  )?.amount ?? null;

/**
 * Month-over-month movement per account for the selected period. Accounts
 * without a bill for either month still appear, with null amounts.
 */
export function buildComparisons(
  accounts: EnergyAccount[],
  bills: EnergyBill[],
  month: number,
  year: number,
): AccountComparison[] {
  const prev = previousPeriod(month, year);
  return accounts.map((account) => {
    const current = amountFor(bills, account.id, month, year);
    const previous = amountFor(bills, account.id, prev.month, prev.year);
    const difference = current !== null && previous !== null ? current - previous : 0;
    const percent =
      current !== null && previous !== null && previous !== 0
        ? (difference / previous) * 100
        : null;
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
  if (overall.currentTotal === 0) return "No electricity bills recorded for this month yet";
  if (overall.status === "No Change") return "Overall Energy Consumption unchanged";
  const arrow = overall.status === "Increased" ? "▲" : "▼";
  const pct =
    overall.percent === null ? "" : ` (${Math.abs(overall.percent).toFixed(2)}%)`;
  return `${arrow} Overall Energy Consumption ${overall.status} by ${formatPHP(
    Math.abs(overall.difference),
  )}${pct}`;
}

/** Combined expense per period, for the monthly trend chart. */
export function monthlyTotals(
  bills: EnergyBill[],
  periods: { month: number; year: number }[],
): number[] {
  return periods.map((p) =>
    bills
      .filter((b) => b.billingMonth === p.month && b.billingYear === p.year)
      .reduce((s, b) => s + b.amount, 0),
  );
}

/** Distinct locations across accounts, for the location filter. */
export function accountLocations(accounts: EnergyAccount[]): string[] {
  return [...new Set(accounts.map((a) => a.location))].sort();
}

/** Distinct billing years present in the data, newest first. */
export function billingYears(bills: EnergyBill[]): number[] {
  const years = [...new Set(bills.map((b) => b.billingYear))].sort((a, b) => b - a);
  return years.length > 0 ? years : [new Date().getFullYear()];
}

export const accountLabel = (a: EnergyAccount) => a.accountName || a.accountNumber;

/* ---------------- submeters ---------------- */

const submeterBillFor = (
  bills: EnergySubmeterBill[],
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
  submeters: EnergySubmeter[],
  bills: EnergySubmeterBill[],
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
export const submetersOf = (submeters: EnergySubmeter[], accountId: string) =>
  submeters.filter((s) => s.accountId === accountId);

/**
 * Rolls an account's submeters up into the account total for the period.
 * Only Active submeters contribute to the live totals; archived ones keep
 * their history for reporting.
 */
export function accountRollup(
  submeters: EnergySubmeter[],
  bills: EnergySubmeterBill[],
  accountId: string,
  month: number,
  year: number,
): AccountRollup {
  const own = submetersOf(submeters, accountId);
  const active = own.filter((s) => s.status === "Active");
  const rows = active
    .map((s) => submeterBillFor(bills, s.id, month, year))
    .filter((b): b is EnergySubmeterBill => b !== null);
  return {
    totalAmount: rows.reduce((s, b) => s + b.amount, 0),
    totalConsumption: rows.reduce((s, b) => s + b.consumption, 0),
    activeSubmeters: active.length,
    totalSubmeters: own.length,
  };
}

export const submeterLabel = (s: EnergySubmeter) => s.submeterName || s.submeterNumber;
