import * as React from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, FileDown, FileSpreadsheet, Printer } from "lucide-react";

import { BRAND_LOGO } from "@/lib/brand";

import {
  Button,
  ContainerCard,
  DropdownFilter,
  OverlineLabel,
  PageHeader,
  PageTransition,
  Skeleton,
  StatusBadge,
  toast,
} from "@/components";
import { formatPHP } from "@/lib/format";
import { useBranding } from "@/features/config/use-appearance";
import { exportCsvFile, exportExcelFile } from "@/features/reports/export";
import { ReportSignatures } from "@/features/shared/report-signoff";
import {
  useEnergyAccounts,
  useEnergyBills,
  useEnergySubmeterBills,
  useEnergySubmeters,
} from "@/features/energy/hooks";
import {
  accountLabel,
  billingYears,
  buildSubmeterComparisons,
  submetersOf,
} from "@/features/energy/lib";
import { MONTHS, monthName, monthShort, type ComparisonStatus } from "@/features/energy/types";
import { departmentByCode } from "@/features/purchase-requests/types";

const now = new Date();

/** 1–12, the calendar the annual report always renders in full. */
const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Peso figure for the dense 12-month matrix; em dash when nothing was billed. */
const cellAmount = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function classify(current: number, previous: number): ComparisonStatus {
  if (current === previous) return "No Change";
  return current > previous ? "Increased" : "Decreased";
}

/**
 * Energy Consumption Summary Report — a full 12-month annual summary, one row
 * per registered account with per-month grand totals, month-over-month
 * comparisons and the annual overview, rendered for landscape A4 printing.
 * This is the standard Water and Fuel will follow.
 */
export function EnergySummaryPage() {
  const navigate = useNavigate();

  const [year, setYear] = React.useState(now.getFullYear());
  const branding = useBranding();
  // Report options (not printed): include the submeter breakdown, and which
  // month it covers. Month defaults to the latest billed month (null = auto).
  const [includeBreakdown, setIncludeBreakdown] = React.useState(true);
  const [breakdownMonthChoice, setBreakdownMonthChoice] = React.useState<number | null>(null);

  const bills = useEnergyBills(React.useMemo(() => ({}), []));
  const accounts = useEnergyAccounts(React.useMemo(() => ({}), []));
  const submeters = useEnergySubmeters(React.useMemo(() => ({}), []));
  const submeterBills = useEnergySubmeterBills(React.useMemo(() => ({}), []));
  const years = React.useMemo(() => billingYears(bills.data), [bills.data]);
  const loading = bills.loading || accounts.loading;

  /**
   * One row per account: twelve monthly amounts (null when unbilled, so the
   * report can show an em dash rather than a misleading zero) and the row's
   * annual total.
   */
  const rows = React.useMemo(
    () =>
      accounts.data.map((account) => {
        const months = ALL_MONTHS.map((m) => {
          const found = bills.data.filter(
            (b) => b.accountId === account.id && b.billingYear === year && b.billingMonth === m,
          );
          return found.length === 0 ? null : found.reduce((s, b) => s + b.amount, 0);
        });
        return {
          account,
          months,
          total: months.reduce((s: number, v) => s + (v ?? 0), 0),
        };
      }),
    [accounts.data, bills.data, year],
  );

  /** Grand total per month across every account, plus the annual total. */
  const monthTotals = React.useMemo(
    () =>
      ALL_MONTHS.map((_, i) => {
        const any = rows.some((r) => r.months[i] !== null);
        return any ? rows.reduce((s, r) => s + (r.months[i] ?? 0), 0) : null;
      }),
    [rows],
  );
  const annualTotal = React.useMemo(
    () => monthTotals.reduce((s: number, v) => s + (v ?? 0), 0),
    [monthTotals],
  );

  /** January→February, February→March, … November→December. */
  const comparisons = React.useMemo(
    () =>
      ALL_MONTHS.slice(1).map((month, idx) => {
        const prevRaw = monthTotals[idx];
        const curRaw = monthTotals[idx + 1];
        // An unbilled month is unknown, not zero spend. Comparing against one
        // would report a phantom 100% swing, so both sides must be billed.
        const hasData = prevRaw !== null && curRaw !== null;
        const previous = prevRaw ?? 0;
        const current = curRaw ?? 0;
        const difference = hasData ? current - previous : 0;
        const percent = hasData && previous !== 0 ? (difference / previous) * 100 : null;
        return {
          month,
          fromLabel: monthShort(month - 1),
          toLabel: monthShort(month),
          previous,
          current,
          difference,
          percent,
          status: hasData ? classify(current, previous) : ("No Change" as ComparisonStatus),
          hasData,
        };
      }),
    [monthTotals],
  );

  /** Highest / lowest consider only months that were actually billed. */
  const overview = React.useMemo(() => {
    const billed = monthTotals
      .map((v, i) => ({ month: i + 1, amount: v }))
      .filter((e): e is { month: number; amount: number } => e.amount !== null && e.amount > 0);
    if (billed.length === 0) {
      return { highest: null, lowest: null, first: null, last: null, difference: 0, percent: null, status: "No Change" as ComparisonStatus };
    }
    const sorted = [...billed].sort((a, b) => b.amount - a.amount);
    const first = billed[0];
    const last = billed[billed.length - 1];
    const difference = last.amount - first.amount;
    const percent = first.amount !== 0 ? (difference / first.amount) * 100 : null;
    return {
      highest: sorted[0],
      lowest: sorted[sorted.length - 1],
      first,
      last,
      difference,
      percent,
      status: classify(last.amount, first.amount),
    };
  }, [monthTotals]);

  /**
   * Submeter breakdown for the most recent billed month of the selected year.
   * The annual report has no month picker, so it anchors on the latest month
   * that actually has data rather than an arbitrary one.
   */
  const breakdownMonth = React.useMemo(() => {
    for (let i = 11; i >= 0; i--) if ((monthTotals[i] ?? 0) > 0) return i + 1;
    return null;
  }, [monthTotals]);

  // The chosen breakdown month, or the auto-detected latest billed month.
  const effectiveBreakdownMonth = breakdownMonthChoice ?? breakdownMonth;

  const breakdown = React.useMemo(() => {
    if (effectiveBreakdownMonth === null) return [];
    return accounts.data
      .map((account) => {
        const subs = submetersOf(submeters.data, account.id);
        const subRows = buildSubmeterComparisons(
          subs,
          submeterBills.data,
          effectiveBreakdownMonth,
          year,
        );
        return {
          account,
          rows: subRows,
          subtotalAmount: subRows.reduce((s, r) => s + (r.current ?? 0), 0),
          subtotalConsumption: subRows.reduce((s, r) => s + r.currentConsumption, 0),
        };
      })
      .filter((g) => g.rows.length > 0);
  }, [accounts.data, submeters.data, submeterBills.data, effectiveBreakdownMonth, year]);

  const grandTotal = React.useMemo(
    () => ({
      amount: breakdown.reduce((s, g) => s + g.subtotalAmount, 0),
      consumption: breakdown.reduce((s, g) => s + g.subtotalConsumption, 0),
      submeters: breakdown.reduce((s, g) => s + g.rows.length, 0),
    }),
    [breakdown],
  );

  /* ---------------- exports ---------------- */
  const exportColumns = [
    "Account Number",
    "Location",
    "Meter Number",
    ...MONTHS.map((m) => m),
    "Grand Total",
  ];
  const exportRows = () => [
    ...rows.map((r) => [
      r.account.accountNumber,
      r.account.location,
      r.account.meterNumber,
      ...r.months.map((v) => (v === null ? "—" : v.toFixed(2))),
      r.total.toFixed(2),
    ]),
    [
      "GRAND TOTAL",
      "",
      "",
      ...monthTotals.map((v) => (v === null ? "—" : v.toFixed(2))),
      annualTotal.toFixed(2),
    ],
  ];

  const fileStem = `energy-consumption-${year}`;

  // Print prints this [data-print-sheet] page (and saves it as PDF). The signature
  // names are edited inline in the report itself before printing.
  const doPrint = () => window.print();
  const doCsv = () => {
    exportCsvFile(`${fileStem}.csv`, exportColumns, exportRows());
    toast.success(`Exported ${rows.length} account${rows.length === 1 ? "" : "s"}`);
  };
  const doExcel = () => {
    exportExcelFile(
      `${fileStem}.xls`,
      `Energy Consumption Report — ${year}`,
      exportColumns,
      exportRows(),
      [
        { label: "Total Annual Expense", value: formatPHP(annualTotal, { decimals: 2 }) },
        {
          label: "Highest Month",
          value: overview.highest
            ? `${monthName(overview.highest.month)} — ${formatPHP(overview.highest.amount, { decimals: 2 })}`
            : "—",
        },
        {
          label: "Lowest Month",
          value: overview.lowest
            ? `${monthName(overview.lowest.month)} — ${formatPHP(overview.lowest.amount, { decimals: 2 })}`
            : "—",
        },
      ],
    );
    toast.success("Excel workbook downloaded");
  };

  const overallText =
    overview.status === "No Change"
      ? "No Change"
      : `${overview.status === "Increased" ? "▲" : "▼"} ${overview.status} by ${formatPHP(
          Math.abs(overview.difference),
        )}${overview.percent === null ? "" : ` (${Math.abs(overview.percent).toFixed(2)}%)`}`;

  return (
    <PageTransition className="space-y-4">
      <div data-print-hide="">
        <PageHeader
          title="Energy Consumption Summary Report"
          description="Twelve-month annual summary of electricity expense across all registered accounts."
          actions={
            <>
              <Button variant="ghost" onClick={() => navigate("/energy")}>
                <ArrowLeft />
                Back
              </Button>
            </>
          }
        />
      </div>

      {/* Report filter — the annual report needs only the year */}
      <ContainerCard data-print-hide="" className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <OverlineLabel className="mr-1">Report Year</OverlineLabel>
          <DropdownFilter
            label="Year"
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
          <span className="ml-1 text-[11.5px] text-neutral-500">
            Covers January – December {year}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12.5px] text-neutral-700">
              <input
                type="checkbox"
                checked={includeBreakdown}
                onChange={(e) => setIncludeBreakdown(e.target.checked)}
                className="h-3.5 w-3.5 accent-neutral-900"
              />
              Include submeter breakdown
            </label>
            {includeBreakdown && (
              <DropdownFilter
                label="Breakdown month"
                value={effectiveBreakdownMonth === null ? "" : String(effectiveBreakdownMonth)}
                onChange={(v) => setBreakdownMonthChoice(Number(v))}
                options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              />
            )}
          </div>
        </div>
      </ContainerCard>

      {/* The printed document: this exact sheet is what the browser prints. */}
      <ContainerCard data-print-sheet="" className="mx-auto w-full max-w-[1400px] p-8">
        {/* Header */}
        <div className="flex items-center justify-center gap-3.5 border-b-2 border-neutral-900 pb-3">
          <img
            src={BRAND_LOGO}
            alt="Municipality of Alaminos seal"
            className="h-14 w-14 shrink-0 object-contain"
          />
          <div className="text-center">
            <div className="text-[11px] text-neutral-500">
              Republic of the Philippines · Province of {branding.province}
            </div>
            <div className="text-[16px] font-bold tracking-tight text-neutral-900">
              {branding.organizationName.toUpperCase()}
            </div>
            <div className="text-[11.5px] text-neutral-600">{branding.officeName}</div>
          </div>
        </div>

        <h2 className="mt-4 text-center text-[17px] font-semibold tracking-[0.06em] text-neutral-900">
          ENERGY CONSUMPTION REPORT
        </h2>
        <div className="mt-1 flex flex-wrap justify-center gap-6 text-[11px] text-neutral-500">
          <span>
            Year: <span className="font-semibold text-neutral-900">{year}</span>
          </span>
          <span>
            Period Covered:{" "}
            <span className="font-semibold text-neutral-900">January – December</span>
          </span>
          <span>
            Generated:{" "}
            <span className="font-semibold text-neutral-900">
              {format(new Date(), "d MMMM yyyy")}
            </span>
          </span>
        </div>

        {/* Twelve-month matrix — one row per account */}
        <div className="mt-5 overflow-x-auto">
          <div className="rounded-t-lg bg-neutral-900 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-white">
            Monthly Electricity Consumption — {year}
          </div>
          <table className="w-full border-collapse border border-t-0 border-neutral-200 text-[9px]">
            <thead>
              <tr>
                <th className="border border-neutral-200 bg-neutral-50 px-1.5 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-wider text-neutral-600">
                  Account Number
                </th>
                <th className="border border-neutral-200 bg-neutral-50 px-1.5 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-wider text-neutral-600">
                  Location
                </th>
                <th className="border border-neutral-200 bg-neutral-50 px-1.5 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-wider text-neutral-600">
                  Meter Number
                </th>
                {ALL_MONTHS.map((m) => (
                  <th
                    key={m}
                    className="border border-neutral-200 bg-neutral-100 px-1.5 py-1.5 text-right text-[8.5px] font-semibold uppercase tracking-wider text-neutral-700"
                  >
                    {monthShort(m)}
                  </th>
                ))}
                <th className="border border-neutral-200 bg-neutral-200/70 px-1.5 py-1.5 text-right text-[8.5px] font-semibold uppercase tracking-wider text-neutral-800">
                  Grand Total
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 16 }).map((__, j) => (
                      <td key={j} className="border border-neutral-200 px-1.5 py-1.5">
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={16}
                    className="border border-neutral-200 px-2 py-6 text-center text-[11px] text-neutral-500"
                  >
                    No energy accounts registered.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.account.id}>
                    <td className="whitespace-nowrap border border-neutral-200 px-1.5 py-1.5 font-medium tabular-nums text-neutral-900">
                      {r.account.accountNumber}
                    </td>
                    <td className="max-w-[110px] truncate border border-neutral-200 px-1.5 py-1.5 text-neutral-600">
                      {r.account.location}
                    </td>
                    <td className="whitespace-nowrap border border-neutral-200 px-1.5 py-1.5 tabular-nums text-neutral-500">
                      {r.account.meterNumber}
                    </td>
                    {r.months.map((v, i) => (
                      <td
                        key={i}
                        className={
                          "whitespace-nowrap border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums " +
                          (v === null ? "text-neutral-300" : "text-neutral-900")
                        }
                      >
                        {cellAmount(v)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap border border-neutral-200 bg-neutral-50 px-1.5 py-1.5 text-right tabular-nums font-semibold text-neutral-900">
                      {cellAmount(r.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Grand totals per month + overall annual total */}
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr>
                  <td
                    colSpan={3}
                    className="border border-neutral-200 bg-neutral-900 px-1.5 py-2 text-[8.5px] font-semibold uppercase tracking-wider text-white"
                  >
                    Grand Total
                  </td>
                  {monthTotals.map((v, i) => (
                    <td
                      key={i}
                      className={
                        "whitespace-nowrap border border-neutral-200 bg-neutral-900 px-1.5 py-2 text-right tabular-nums font-semibold " +
                        (v === null ? "text-neutral-500" : "text-white")
                      }
                    >
                      {cellAmount(v)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap border border-neutral-200 bg-neutral-900 px-1.5 py-2 text-right tabular-nums font-bold text-white">
                    {cellAmount(annualTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Month-over-month comparison — January→February … November→December */}
        <div className="mt-5 break-inside-avoid">
          <div className="rounded-t-lg bg-neutral-100 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-neutral-700">
            Month-over-Month Comparison
          </div>
          <div className="grid grid-cols-6 gap-px border border-t-0 border-neutral-200 bg-neutral-200 lg:grid-cols-11">
            {comparisons.map((c) => (
              <div key={c.month} className="bg-white px-1.5 py-2 text-center">
                <div className="text-[8.5px] font-semibold uppercase tracking-wider text-neutral-500">
                  {c.fromLabel} → {c.toLabel}
                </div>
                <div
                  className={
                    "mt-0.5 text-[12px] font-bold leading-none " +
                    (!c.hasData
                      ? "text-neutral-300"
                      : c.status === "Increased"
                        ? "text-red-600"
                        : c.status === "Decreased"
                          ? "text-emerald-700"
                          : "text-neutral-400")
                  }
                >
                  {!c.hasData ? "—" : c.status === "Increased" ? "▲" : c.status === "Decreased" ? "▼" : "—"}
                </div>
                <div
                  className={
                    "mt-0.5 text-[8.5px] tabular-nums " +
                    (!c.hasData
                      ? "text-neutral-300"
                      : c.status === "Increased"
                        ? "text-red-600"
                        : c.status === "Decreased"
                          ? "text-emerald-700"
                          : "text-neutral-400")
                  }
                >
                  {!c.hasData
                    ? "—"
                    : `${c.difference > 0 ? "+" : c.difference < 0 ? "−" : ""}${Math.abs(
                        c.difference,
                      ).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`}
                </div>
                <div className="text-[8px] tabular-nums text-neutral-400">
                  {!c.hasData || c.percent === null
                    ? "—"
                    : `${Math.abs(c.percent).toFixed(1)}%`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Overall summary */}
        <div className="mt-4 flex flex-wrap items-stretch gap-4 break-inside-avoid">
          <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-1.5 rounded-lg border border-neutral-200 p-4 text-[11.5px] sm:grid-cols-3">
            <div>
              <OverlineLabel>Highest Month</OverlineLabel>
              <div className="mt-0.5 text-[14px] font-semibold tracking-tight text-neutral-900">
                {overview.highest ? monthName(overview.highest.month) : "—"}
              </div>
              {overview.highest && (
                <div className="text-[10.5px] tabular-nums text-neutral-500">
                  {formatPHP(overview.highest.amount, { decimals: 2 })}
                </div>
              )}
            </div>
            <div>
              <OverlineLabel>Lowest Month</OverlineLabel>
              <div className="mt-0.5 text-[14px] font-semibold tracking-tight text-neutral-900">
                {overview.lowest ? monthName(overview.lowest.month) : "—"}
              </div>
              {overview.lowest && (
                <div className="text-[10.5px] tabular-nums text-neutral-500">
                  {formatPHP(overview.lowest.amount, { decimals: 2 })}
                </div>
              )}
            </div>
            <div>
              <OverlineLabel>Total Annual Expense</OverlineLabel>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums tracking-tight text-neutral-900">
                {formatPHP(annualTotal, { decimals: 2 })}
              </div>
              <div className="text-[10.5px] text-neutral-500">
                {rows.length} account{rows.length === 1 ? "" : "s"} · {year}
              </div>
            </div>
          </div>
          <div className="flex min-w-[250px] flex-col justify-center rounded-lg border border-neutral-200 p-4">
            <OverlineLabel>Overall Increase / Decrease</OverlineLabel>
            <div className="mt-1.5">
              <StatusBadge status={overview.status} />
            </div>
            <div
              className={
                "mt-1.5 text-[13px] font-semibold tracking-tight " +
                (overview.status === "Increased"
                  ? "text-red-700"
                  : overview.status === "Decreased"
                    ? "text-emerald-700"
                    : "text-neutral-600")
              }
            >
              {overallText}
            </div>
            {overview.first && overview.last && (
              <p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">
                {monthName(overview.first.month)} {formatPHP(overview.first.amount)} →{" "}
                {monthName(overview.last.month)} {formatPHP(overview.last.amount)}.
              </p>
            )}
          </div>
        </div>

        {/* Submeter breakdown — main account → submeters → grand total */}
        {includeBreakdown && breakdown.length > 0 && effectiveBreakdownMonth !== null && (
          // Scrolls sideways inside itself on a phone, as the monthly matrix does; never on paper.
          <div className="mt-6 overflow-x-auto print:overflow-visible">
            <div className="rounded-t-lg bg-neutral-900 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-white">
              Submeter Breakdown — {monthName(effectiveBreakdownMonth)} {year}
            </div>
            <table className="w-full border-collapse border border-t-0 border-neutral-200 text-[11.5px]">
              <thead>
                <tr>
                  <th className="border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-neutral-600">
                    Main Account / Submeter
                  </th>
                  <th className="border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-neutral-600">
                    Assigned Office
                  </th>
                  <th className="border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-neutral-600">
                    Assigned User
                  </th>
                  <th className="border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-neutral-600">
                    Consumption (KW)
                  </th>
                  <th className="border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-neutral-600">
                    Amount (PHP)
                  </th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((group) => (
                  <React.Fragment key={group.account.id}>
                    <tr>
                      <td
                        colSpan={3}
                        className="border border-neutral-200 bg-neutral-100/70 px-2.5 py-1.5 font-semibold text-neutral-900"
                      >
                        {accountLabel(group.account)} · {group.account.accountNumber}
                      </td>
                      <td className="border border-neutral-200 bg-neutral-100/70 px-2.5 py-1.5 text-right tabular-nums font-semibold text-neutral-900">
                        {group.subtotalConsumption.toLocaleString("en-PH", {
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      <td className="border border-neutral-200 bg-neutral-100/70 px-2.5 py-1.5 text-right tabular-nums font-semibold text-neutral-900">
                        {formatPHP(group.subtotalAmount, { decimals: 2 })}
                      </td>
                    </tr>
                    {group.rows.map((r) => (
                      <tr key={r.submeter.id}>
                        <td className="border border-neutral-200 px-2.5 py-1.5 pl-6 text-neutral-700">
                          {r.submeter.submeterName}
                          <span className="ml-1 text-[10px] text-neutral-400">
                            {r.submeter.submeterNumber}
                          </span>
                          {r.submeter.status === "Inactive" && (
                            <span className="ml-1 text-[10px] text-neutral-400">(archived)</span>
                          )}
                        </td>
                        <td className="border border-neutral-200 px-2.5 py-1.5 text-neutral-600">
                          {departmentByCode(r.submeter.officeCode)?.name ?? r.submeter.officeCode}
                        </td>
                        <td className="border border-neutral-200 px-2.5 py-1.5 text-neutral-600">
                          {r.submeter.assignedUser ?? "—"}
                        </td>
                        <td className="border border-neutral-200 px-2.5 py-1.5 text-right tabular-nums text-neutral-800">
                          {r.currentConsumption === 0
                            ? "—"
                            : r.currentConsumption.toLocaleString("en-PH", {
                                maximumFractionDigits: 0,
                              })}
                        </td>
                        <td className="border border-neutral-200 px-2.5 py-1.5 text-right tabular-nums text-neutral-800">
                          {r.current === null ? "—" : formatPHP(r.current, { decimals: 2 })}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                <tr>
                  <td
                    colSpan={3}
                    className="border border-neutral-200 bg-neutral-900 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-white"
                  >
                    Grand Total · {grandTotal.submeters} submeter
                    {grandTotal.submeters === 1 ? "" : "s"}
                  </td>
                  <td className="border border-neutral-200 bg-neutral-900 px-2.5 py-2 text-right tabular-nums font-bold text-white">
                    {grandTotal.consumption.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="border border-neutral-200 bg-neutral-900 px-2.5 py-2 text-right tabular-nums font-bold text-white">
                    {formatPHP(grandTotal.amount, { decimals: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Signatures */}
        <ReportSignatures />
      </ContainerCard>

      {/* Actions repeated at the bottom (not printed) for convenience after
          filling in the signature names. */}
      <div data-print-hide="" className="flex flex-wrap justify-end gap-2 pb-2">
        <Button variant="secondary" onClick={doCsv}>
          <FileDown />
          Export CSV
        </Button>
        <Button variant="secondary" onClick={doExcel}>
          <FileSpreadsheet />
          Export Excel
        </Button>
        {/* One button: the browser's print dialog also saves as PDF. */}
        <Button onClick={doPrint}>
          <Printer />
          Print or save PDF
        </Button>
      </div>
    </PageTransition>
  );
}
