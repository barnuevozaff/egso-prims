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
  useFuelTransactions,
  useFuelTrips,
  useFuelVehicles,
} from "@/features/fuel/hooks";
import {
  buildVehicleHistory,
  periodTotals,
  summariseTrips,
  tripInPeriod,
  transactionYears,
  tripYears,
} from "@/features/fuel/lib";
import { MONTHS, monthName, monthShort, type ComparisonStatus } from "@/features/fuel/types";
import { departmentByCode } from "@/features/purchase-requests/types";

const now = new Date();

/** 1–12, the calendar the annual report always renders in full. */
const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Peso figure for the dense 12-month matrix; em dash when nothing was recorded. */
const cellAmount = (n: number | null) =>
  n === null
    ? "—"
    : n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Two-decimal figure for the distance table. */
const num = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function classify(current: number, previous: number): ComparisonStatus {
  if (current === previous) return "No Change";
  return current > previous ? "Increased" : "Decreased";
}

/**
 * Fuel Consumption Summary Report — a full 12-month annual summary, one row
 * per registered vehicle with per-month grand totals, month-over-month
 * comparisons and the annual overview, rendered for landscape A4 printing.
 * Mirrors the Energy and Water annual report standard.
 */
export function FuelSummaryPage() {
  const navigate = useNavigate();

  const [year, setYear] = React.useState(now.getFullYear());
  // Individual trip lines are optional: most months only need the rollups.
  const [includeTripDetail, setIncludeTripDetail] = React.useState(false);
  const [detailMonth, setDetailMonth] = React.useState(now.getMonth() + 1);
  const branding = useBranding();

  const transactions = useFuelTransactions(React.useMemo(() => ({}), []));
  const vehicles = useFuelVehicles(React.useMemo(() => ({}), []));
  const trips = useFuelTrips(React.useMemo(() => ({}), []));
  const years = React.useMemo(() => {
    const ys = [
      ...new Set([...tripYears(trips.data), ...transactionYears(transactions.data)]),
    ].sort((a, b) => b - a);
    return ys.length ? ys : [now.getFullYear()];
  }, [trips.data, transactions.data]);
  const loading = transactions.loading || vehicles.loading || trips.loading;

  /* ---------------- trip rollups ---------------- */

  /** Trips of the reporting year, in sheet order. */
  const yearTrips = React.useMemo(
    () => trips.data.filter((t) => new Date(t.tripDate).getFullYear() === year),
    [trips.data, year],
  );

  /**
   * Distance, fuel and efficiency per vehicle, derived from trips. Vehicles
   * with no trip in the year are left out so the sheet stays readable.
   */
  const tripRows = React.useMemo(
    () =>
      vehicles.data
        .map((vehicle) => {
          const rowsForVehicle = yearTrips.filter((t) => t.vehicleId === vehicle.id);
          return {
            vehicle,
            ...summariseTrips(rowsForVehicle),
            balance: buildVehicleHistory(vehicle, trips.data).currentFuelBalance,
          };
        })
        .filter((r) => r.trips > 0),
    [vehicles.data, yearTrips, trips.data],
  );

  const tripTotals = React.useMemo(() => summariseTrips(yearTrips), [yearTrips]);

  /** Trips of the chosen month, for the optional detail sheet. */
  const detailTrips = React.useMemo(
    () =>
      yearTrips
        .filter((t) => tripInPeriod(t, detailMonth, year))
        .sort((a, b) => (a.tripDate < b.tripDate ? -1 : a.tripDate > b.tripDate ? 1 : 0)),
    [yearTrips, detailMonth, year],
  );
  const detailTotals = React.useMemo(() => summariseTrips(detailTrips), [detailTrips]);
  const vehicleById = React.useMemo(
    () => new Map(vehicles.data.map((v) => [v.id, v])),
    [vehicles.data],
  );

  /**
   * One row per vehicle: twelve monthly totals summed from that month's
   * fill-ups (null when nothing was recorded, so the report shows an em dash
   * rather than a misleading zero) and the row's annual total.
   */
  const rows = React.useMemo(
    () =>
      vehicles.data.map((vehicle) => {
        const months = ALL_MONTHS.map((m) => {
          const t = periodTotals(transactions.data, vehicle.id, m, year);
          return t.count === 0 ? null : t.amount;
        });
        return {
          vehicle,
          months,
          total: months.reduce((s: number, v) => s + (v ?? 0), 0),
        };
      }),
    [vehicles.data, transactions.data, year],
  );

  /** Grand total per month across every vehicle, plus the annual total. */
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
        // A month with no fuel records is unknown, not zero spend. Comparing
        // against one would report a phantom 100% swing, so both sides must
        // have records.
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

  /** Highest / lowest consider only months that actually have records. */
  const overview = React.useMemo(() => {
    const recorded = monthTotals
      .map((v, i) => ({ month: i + 1, amount: v }))
      .filter((e): e is { month: number; amount: number } => e.amount !== null && e.amount > 0);
    if (recorded.length === 0) {
      return {
        highest: null,
        lowest: null,
        first: null,
        last: null,
        difference: 0,
        percent: null,
        status: "No Change" as ComparisonStatus,
      };
    }
    const sorted = [...recorded].sort((a, b) => b.amount - a.amount);
    const first = recorded[0];
    const last = recorded[recorded.length - 1];
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

  /* ---------------- exports ---------------- */
  const exportColumns = [
    "Plate Number",
    "Vehicle Name",
    "Assigned Office",
    ...MONTHS.map((m) => m),
    "Grand Total",
  ];
  const exportRows = () => [
    ...rows.map((r) => [
      r.vehicle.plateNumber,
      r.vehicle.vehicleName,
      departmentByCode(r.vehicle.officeCode)?.name ?? r.vehicle.officeCode,
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

  const fileStem = `fuel-consumption-${year}`;

  // Print prints this [data-print-sheet] page (and saves it as PDF). The signature
  // names are edited inline in the report itself before printing.
  const doPrint = () => window.print();
  const doCsv = () => {
    exportCsvFile(`${fileStem}.csv`, exportColumns, exportRows());
    toast.success(`Exported ${rows.length} vehicle${rows.length === 1 ? "" : "s"}`);
  };
  const doExcel = () => {
    exportExcelFile(
      `${fileStem}.xls`,
      `Fuel Consumption Report — ${year}`,
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
        { label: "Total Trips", value: tripTotals.trips.toLocaleString("en-PH") },
        {
          label: "Total Distance",
          value: `${tripTotals.distance.toLocaleString("en-PH", { maximumFractionDigits: 0 })} km`,
        },
        { label: "Total Fuel Used", value: `${num(tripTotals.fuelUsed)} L` },
        {
          label: "Average Efficiency",
          value:
            tripTotals.averageKmPerLiter === null
              ? "—"
              : `${tripTotals.averageKmPerLiter.toFixed(2)} km/L`,
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
          title="Fuel Consumption Summary Report"
          description="Twelve-month annual summary of trips, distance and fuel across all registered vehicles."
          actions={
            <>
              <Button variant="ghost" onClick={() => navigate("/fuel")}>
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
                checked={includeTripDetail}
                onChange={(e) => setIncludeTripDetail(e.target.checked)}
                className="h-3.5 w-3.5 accent-neutral-900"
              />
              Include trip detail
            </label>
            {includeTripDetail && (
              <DropdownFilter
                label="Detail month"
                value={String(detailMonth)}
                onChange={(v) => setDetailMonth(Number(v))}
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
          FUEL CONSUMPTION REPORT
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

        {/* Twelve-month matrix — one row per vehicle */}
        <div className="mt-5 overflow-x-auto">
          <div className="rounded-t-lg bg-neutral-900 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-white">
            Monthly Fuel Consumption — {year}
          </div>
          <table className="w-full border-collapse border border-t-0 border-neutral-200 text-[9px]">
            <thead>
              <tr>
                <th className="border border-neutral-200 bg-neutral-50 px-1.5 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-wider text-neutral-600">
                  Plate Number
                </th>
                <th className="border border-neutral-200 bg-neutral-50 px-1.5 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-wider text-neutral-600">
                  Vehicle Name
                </th>
                <th className="border border-neutral-200 bg-neutral-50 px-1.5 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-wider text-neutral-600">
                  Assigned Office
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
                    No vehicles registered.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.vehicle.id}>
                    <td className="whitespace-nowrap border border-neutral-200 px-1.5 py-1.5 font-medium tabular-nums text-neutral-900">
                      {r.vehicle.plateNumber}
                    </td>
                    <td className="max-w-[130px] truncate border border-neutral-200 px-1.5 py-1.5 text-neutral-700">
                      {r.vehicle.vehicleName}
                    </td>
                    <td className="max-w-[110px] truncate border border-neutral-200 px-1.5 py-1.5 text-neutral-600">
                      {departmentByCode(r.vehicle.officeCode)?.name ?? r.vehicle.officeCode}
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
                  {!c.hasData
                    ? "—"
                    : c.status === "Increased"
                      ? "▲"
                      : c.status === "Decreased"
                        ? "▼"
                        : "—"}
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
                  {!c.hasData || c.percent === null ? "—" : `${Math.abs(c.percent).toFixed(1)}%`}
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
              <OverlineLabel>Total Annual Fuel Expense</OverlineLabel>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums tracking-tight text-neutral-900">
                {formatPHP(annualTotal, { decimals: 2 })}
              </div>
              <div className="text-[10.5px] text-neutral-500">
                {rows.length} vehicle{rows.length === 1 ? "" : "s"} · {year}
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

        {/* Trip-based distance and efficiency, derived from recorded trips */}
        {tripRows.length > 0 && (
          <div className="mt-6 break-inside-avoid">
            <div className="rounded-t-lg bg-neutral-900 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-white">
              Trip Summary — Distance &amp; Fuel Efficiency — {year}
            </div>
            <table className="w-full border-collapse border border-t-0 border-neutral-200 text-[11.5px]">
              <thead>
                <tr>
                  {[
                    "Plate Number",
                    "Vehicle",
                    "Assigned Office",
                  ].map((h) => (
                    <th
                      key={h}
                      className="border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-neutral-600"
                    >
                      {h}
                    </th>
                  ))}
                  {[
                    "Trips",
                    "Distance (km)",
                    "Fuel Added (L)",
                    "Fuel Used (L)",
                    "km / L",
                    "Balance (L)",
                  ].map((h) => (
                    <th
                      key={h}
                      className="border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-neutral-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tripRows.map((r) => (
                  <tr key={r.vehicle.id}>
                    <td className="border border-neutral-200 px-2.5 py-1.5 tabular-nums font-medium text-neutral-900">
                      {r.vehicle.plateNumber}
                    </td>
                    <td className="border border-neutral-200 px-2.5 py-1.5 text-neutral-700">
                      {r.vehicle.vehicleName}
                    </td>
                    <td className="border border-neutral-200 px-2.5 py-1.5 text-neutral-600">
                      {departmentByCode(r.vehicle.officeCode)?.name ?? r.vehicle.officeCode}
                    </td>
                    <td className="border border-neutral-200 px-2.5 py-1.5 text-right tabular-nums text-neutral-700">
                      {r.trips.toLocaleString("en-PH")}
                    </td>
                    <td className="border border-neutral-200 px-2.5 py-1.5 text-right tabular-nums text-neutral-900">
                      {r.distance.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="border border-neutral-200 px-2.5 py-1.5 text-right tabular-nums text-neutral-700">
                      {num(r.fuelAdded)}
                    </td>
                    <td className="border border-neutral-200 px-2.5 py-1.5 text-right tabular-nums text-neutral-900">
                      {num(r.fuelUsed)}
                    </td>
                    <td className="border border-neutral-200 px-2.5 py-1.5 text-right tabular-nums text-neutral-600">
                      {r.averageKmPerLiter === null ? "—" : r.averageKmPerLiter.toFixed(2)}
                    </td>
                    <td className="border border-neutral-200 px-2.5 py-1.5 text-right tabular-nums text-neutral-700">
                      {num(r.balance)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td
                    colSpan={3}
                    className="border border-neutral-200 bg-neutral-900 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-white"
                  >
                    Grand Total · {tripRows.length} vehicle{tripRows.length === 1 ? "" : "s"}
                  </td>
                  <td className="border border-neutral-200 bg-neutral-900 px-2.5 py-2 text-right tabular-nums font-bold text-white">
                    {tripTotals.trips.toLocaleString("en-PH")}
                  </td>
                  <td className="border border-neutral-200 bg-neutral-900 px-2.5 py-2 text-right tabular-nums font-bold text-white">
                    {tripTotals.distance.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="border border-neutral-200 bg-neutral-900 px-2.5 py-2 text-right tabular-nums font-bold text-white">
                    {num(tripTotals.fuelAdded)}
                  </td>
                  <td className="border border-neutral-200 bg-neutral-900 px-2.5 py-2 text-right tabular-nums font-bold text-white">
                    {num(tripTotals.fuelUsed)}
                  </td>
                  <td className="border border-neutral-200 bg-neutral-900 px-2.5 py-2 text-right tabular-nums font-bold text-white">
                    {tripTotals.averageKmPerLiter === null
                      ? "—"
                      : tripTotals.averageKmPerLiter.toFixed(2)}
                  </td>
                  <td className="border border-neutral-200 bg-neutral-900 px-2.5 py-2" />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Optional trip detail for a single month — the Trip Summary sheet */}
        {includeTripDetail && (
          <div className="mt-6 break-inside-avoid">
            <div className="rounded-t-lg bg-neutral-900 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-white">
              Trip Detail — {monthName(detailMonth)} {year}
            </div>
            {detailTrips.length === 0 ? (
              <div className="border border-t-0 border-neutral-200 px-3 py-6 text-center text-[11px] text-neutral-500">
                No trips were recorded for {monthName(detailMonth)} {year}.
              </div>
            ) : (
              <table className="w-full border-collapse border border-t-0 border-neutral-200 text-[9.5px]">
                <thead>
                  <tr>
                    {["Control No", "Date", "Plate", "Purpose", "From", "To", "Driver"].map((h) => (
                      <th
                        key={h}
                        className="border border-neutral-200 bg-neutral-50 px-1.5 py-1.5 text-left text-[8.5px] font-semibold uppercase tracking-wider text-neutral-600"
                      >
                        {h}
                      </th>
                    ))}
                    {[
                      "Trips",
                      "Odo. Out",
                      "Odo. In",
                      "Distance",
                      "Beginning",
                      "Added",
                      "Total",
                      "Used",
                      "Ending",
                    ].map((h) => (
                      <th
                        key={h}
                        className="border border-neutral-200 bg-neutral-100 px-1.5 py-1.5 text-right text-[8.5px] font-semibold uppercase tracking-wider text-neutral-700"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detailTrips.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap border border-neutral-200 px-1.5 py-1.5 tabular-nums font-medium text-neutral-900">
                        {t.controlNo}
                      </td>
                      <td className="whitespace-nowrap border border-neutral-200 px-1.5 py-1.5 tabular-nums text-neutral-600">
                        {format(new Date(t.tripDate), "d MMM")}
                      </td>
                      <td className="whitespace-nowrap border border-neutral-200 px-1.5 py-1.5 tabular-nums text-neutral-800">
                        {vehicleById.get(t.vehicleId)?.plateNumber ?? "—"}
                      </td>
                      <td className="max-w-[120px] truncate border border-neutral-200 px-1.5 py-1.5 text-neutral-600">
                        {t.purpose ?? "—"}
                      </td>
                      <td className="max-w-[100px] truncate border border-neutral-200 px-1.5 py-1.5 text-neutral-600">
                        {t.origin ?? "—"}
                      </td>
                      <td className="max-w-[100px] truncate border border-neutral-200 px-1.5 py-1.5 text-neutral-600">
                        {t.destination ?? "—"}
                      </td>
                      <td className="max-w-[100px] truncate border border-neutral-200 px-1.5 py-1.5 text-neutral-600">
                        {t.driver ?? "—"}
                      </td>
                      <td className="border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums text-neutral-700">
                        {t.noOfTrips}
                      </td>
                      <td className="border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums text-neutral-600">
                        {t.beginningOdometer.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums text-neutral-600">
                        {t.endingOdometer.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums font-medium text-neutral-900">
                        {num(t.distanceTravelled)}
                      </td>
                      <td className="border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums text-neutral-600">
                        {num(t.beginningFuel)}
                      </td>
                      <td className="border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums text-neutral-600">
                        {num(t.fuelAdded)}
                      </td>
                      <td className="border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums text-neutral-600">
                        {num(t.fuelTotal)}
                      </td>
                      <td className="border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums font-medium text-neutral-900">
                        {num(t.fuelUsed)}
                      </td>
                      <td className="border border-neutral-200 px-1.5 py-1.5 text-right tabular-nums text-neutral-800">
                        {num(t.endingFuel)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td
                      colSpan={10}
                      className="border border-neutral-200 bg-neutral-900 px-1.5 py-2 text-[8.5px] font-semibold uppercase tracking-wider text-white"
                    >
                      {monthName(detailMonth)} Total · {detailTotals.trips} trip
                      {detailTotals.trips === 1 ? "" : "s"}
                    </td>
                    <td className="border border-neutral-200 bg-neutral-900 px-1.5 py-2 text-right tabular-nums font-bold text-white">
                      {num(detailTotals.distance)}
                    </td>
                    <td className="border border-neutral-200 bg-neutral-900 px-1.5 py-2" />
                    <td className="border border-neutral-200 bg-neutral-900 px-1.5 py-2 text-right tabular-nums font-bold text-white">
                      {num(detailTotals.fuelAdded)}
                    </td>
                    <td className="border border-neutral-200 bg-neutral-900 px-1.5 py-2" />
                    <td className="border border-neutral-200 bg-neutral-900 px-1.5 py-2 text-right tabular-nums font-bold text-white">
                      {num(detailTotals.fuelUsed)}
                    </td>
                    <td className="border border-neutral-200 bg-neutral-900 px-1.5 py-2" />
                  </tr>
                </tbody>
              </table>
            )}
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
