import * as React from "react";
import { format } from "date-fns";
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  Car,
  Clock3,
  Droplets,
  Fuel,
  Gauge,
  PackageX,
  PieChart,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

import {
  BarChartContainer,
  Caption,
  ChartCard,
  ContainerCard,
  CurrencyDisplay,
  DonutChartContainer,
  LineChartContainer,
  OverlineLabel,
  ProgressBar,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  chartPalette,
} from "@/components";
import {
  averageApprovalDays,
  countByMonth,
  distribution,
  facilityCounts,
  itemRequestTotals,
  lastMonths,
  lowStockItems,
  movementByDay,
  outOfStockItems,
  peakHours,
  poTotal,
  sumByMonth,
  sumDistribution,
  supplierActivity,
  topEntries,
  totalInventoryValue,
  type ReportsData,
} from "@/features/reports/analytics";
import { departmentByCode, PENDING_PR_STATUSES } from "@/features/purchase-requests/types";
import { itemValue } from "@/features/inventory/types";
import {
  accountLabel,
  buildComparisons,
  buildOverall,
  monthlyTotals,
  trailingPeriods,
} from "@/features/energy/lib";
import { monthName } from "@/features/energy/types";
import {
  accountLabel as waterAccountLabel,
  buildComparisons as buildWaterComparisons,
  buildOverall as buildWaterOverall,
  monthlyTotals as waterMonthlyTotals,
  trailingPeriods as waterTrailingPeriods,
} from "@/features/water/lib";
import {
  buildComparisons as buildFuelComparisons,
  buildOverall as buildFuelOverall,
  fuelTypeSplit,
  monthlyTotals as fuelMonthlyTotals,
  trailingPeriods as fuelTrailingPeriods,
  vehicleLabel,
} from "@/features/fuel/lib";

/** Small stat tile composed from library primitives. */
function StatTile({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <ContainerCard className="p-4">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[12px] text-neutral-500">{label}</span>
      </div>
      <div className="mt-3 text-[22px] font-semibold tracking-tight text-neutral-900 tabular-nums">
        {children}
      </div>
    </ContainerCard>
  );
}

/** Executive analytics: overview charts + procurement/inventory/facility tabs. */
export function AnalyticsPanels({
  data,
  loading,
}: {
  data: ReportsData | null;
  loading: boolean;
}) {
  const months = React.useMemo(() => lastMonths(6), []);
  const labels = months.map((m) => m.label);

  const d: ReportsData = data ?? {
    prs: [],
    pos: [],
    ris: [],
    items: [],
    stockCard: [],
    reservations: [],
    energyAccounts: [],
    energyBills: [],
    waterAccounts: [],
    waterBills: [],
    fuelVehicles: [],
    fuelTransactions: [],
    fuelTrips: [],
    energySubmeters: [],
    energySubmeterBills: [],
  };

  /* Overview datasets */
  const prPerMonth = countByMonth(d.prs.map((p) => p.requestDate), months);
  const poTrend = sumByMonth(d.pos.map((p) => ({ date: p.issuedDate, value: poTotal(p) })), months);
  const prStatus = topEntries(distribution(d.prs, (p) => p.status));
  const invCategories = topEntries(
    sumDistribution(d.items, (it) => it.category, (it) => itemValue(it)),
  );
  const deptRequests = topEntries(
    distribution(d.prs, (p) => departmentByCode(p.departmentCode).code),
  );
  const movement = movementByDay(d.stockCard, 14);

  /* Procurement */
  const pendingApprovals = d.prs.filter((p) => PENDING_PR_STATUSES.includes(p.status)).length;
  const avgDays = averageApprovalDays(d.prs);
  const monthKeyNow = format(new Date(), "yyyy-MM");
  const procurementThisMonth = d.pos
    .filter((p) => p.issuedDate.startsWith(monthKeyNow))
    .reduce((s, p) => s + poTotal(p), 0);
  const deptProcurement = topEntries(
    sumDistribution(d.pos, (p) => departmentByCode(p.departmentCode).code, (p) => poTotal(p)),
  );
  const suppliers = supplierActivity(d.pos);

  /* Inventory */
  const invValue = totalInventoryValue(d.items);
  const requested = itemRequestTotals(d.ris);
  const mostRequested = topEntries(requested, 5);
  const leastRequested = topEntries(requested).slice(-5).reverse();
  const low = lowStockItems(d.items);
  const out = outOfStockItems(d.items);
  const recentMovements = [...d.stockCard]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  /* Facilities */
  const facCounts = topEntries(facilityCounts(d.reservations));
  const hours = peakHours(d.reservations);
  const resTrend = countByMonth(d.reservations.map((r) => r.date), months);
  const activeRes = d.reservations.filter((r) => !["Cancelled", "Rejected"].includes(r.status));
  const perWeek = activeRes.length / 4;

  /* Energy */
  const energyNow = new Date();
  const energyMonth = energyNow.getMonth() + 1;
  const energyYear = energyNow.getFullYear();
  const energyComparisons = buildComparisons(
    d.energyAccounts,
    d.energyBills,
    energyMonth,
    energyYear,
  );
  const energyOverall = buildOverall(energyComparisons);
  const energyPeriods = trailingPeriods(energyMonth, energyYear, 12);
  const energyTrend = monthlyTotals(d.energyBills, energyPeriods);
  const energyRanked = [...energyComparisons]
    .filter((c) => c.current !== null)
    .sort((a, b) => (b.current ?? 0) - (a.current ?? 0));
  const energyTopAccounts = energyRanked.slice(0, 10);
  const energyMonthKw = d.energyBills
    .filter((b) => b.billingMonth === energyMonth && b.billingYear === energyYear)
    .reduce((s, b) => s + b.kwh, 0);

  /* Water — same period basis as energy */
  const waterComparisons = buildWaterComparisons(
    d.waterAccounts,
    d.waterBills,
    energyMonth,
    energyYear,
  );
  const waterOverall = buildWaterOverall(waterComparisons);
  const waterPeriods = waterTrailingPeriods(energyMonth, energyYear, 12);
  const waterTrend = waterMonthlyTotals(d.waterBills, waterPeriods);
  const waterRanked = [...waterComparisons]
    .filter((c) => c.current !== null)
    .sort((a, b) => (b.current ?? 0) - (a.current ?? 0));
  const waterTopAccounts = waterRanked.slice(0, 10);
  const waterMonthVolume = d.waterBills
    .filter((b) => b.billingMonth === energyMonth && b.billingYear === energyYear)
    .reduce((s, b) => s + b.consumption, 0);

  /* Fuel — same period basis as energy and water */
  const fuelComparisons = buildFuelComparisons(
    d.fuelVehicles,
    d.fuelTransactions,
    energyMonth,
    energyYear,
  );
  const fuelOverall = buildFuelOverall(fuelComparisons);
  const fuelPeriods = fuelTrailingPeriods(energyMonth, energyYear, 12);
  const fuelTrend = fuelMonthlyTotals(d.fuelTransactions, fuelPeriods);
  const fuelRanked = [...fuelComparisons]
    .filter((c) => c.current !== null)
    .sort((a, b) => (b.current ?? 0) - (a.current ?? 0));
  const fuelTopVehicles = fuelRanked.slice(0, 10);
  const fuelSplit = fuelTypeSplit(d.fuelTransactions, energyMonth, energyYear);

  const maxRequested = mostRequested[0]?.[1] ?? 1;

  return (
    <Tabs defaultValue="overview">
      <TabsList className="bg-neutral-100">
        <TabsTrigger value="overview" className="text-[12.5px]">
          Overview
        </TabsTrigger>
        <TabsTrigger value="procurement" className="text-[12.5px]">
          Procurement
        </TabsTrigger>
        <TabsTrigger value="inventory" className="text-[12.5px]">
          Inventory
        </TabsTrigger>
        <TabsTrigger value="facilities" className="text-[12.5px]">
          Facilities
        </TabsTrigger>
        <TabsTrigger value="energy" className="text-[12.5px]">
          Energy
        </TabsTrigger>
        <TabsTrigger value="water" className="text-[12.5px]">
          Water
        </TabsTrigger>
        <TabsTrigger value="fuel" className="text-[12.5px]">
          Fuel
        </TabsTrigger>
      </TabsList>

      {/* ---------------- Overview ---------------- */}
      <TabsContent value="overview" className="pt-3">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <ChartCard title="Purchase Requests per Month" icon={BarChart3} loading={loading}>
            <BarChartContainer
              data={{
                labels,
                datasets: [
                  { label: "Requests", data: prPerMonth, backgroundColor: chartPalette[0], borderRadius: 6, maxBarThickness: 36 },
                ],
              }}
            />
          </ChartCard>
          <ChartCard title="Monthly Procurement Trend (₱)" icon={ShoppingCart} loading={loading}>
            <LineChartContainer
              data={{
                labels,
                datasets: [
                  {
                    label: "PO Value",
                    data: poTrend,
                    borderColor: chartPalette[1],
                    backgroundColor: chartPalette[1] + "22",
                    fill: true,
                  },
                ],
              }}
            />
          </ChartCard>
          <ChartCard title="PR Status Distribution" icon={BarChart3} loading={loading}>
            <DonutChartContainer
              data={{
                labels: prStatus.map(([k]) => k),
                datasets: [
                  {
                    data: prStatus.map(([, v]) => v),
                    backgroundColor: chartPalette,
                    borderWidth: 2,
                    borderColor: "#ffffff",
                  },
                ],
              }}
            />
          </ChartCard>
          <ChartCard title="Inventory Category Distribution (₱)" icon={Boxes} loading={loading}>
            <DonutChartContainer
              data={{
                labels: invCategories.map(([k]) => k),
                datasets: [
                  {
                    data: invCategories.map(([, v]) => v),
                    backgroundColor: chartPalette,
                    borderWidth: 2,
                    borderColor: "#ffffff",
                  },
                ],
              }}
            />
          </ChartCard>
          <ChartCard title="Department Requests" icon={Building2} loading={loading}>
            <BarChartContainer
              data={{
                labels: deptRequests.map(([k]) => k),
                datasets: [
                  { label: "Requests", data: deptRequests.map(([, v]) => v), backgroundColor: chartPalette[2], borderRadius: 6, maxBarThickness: 28 },
                ],
              }}
            />
          </ChartCard>
          <ChartCard title="Inventory Movement (14 days)" icon={ArrowLeftRight} loading={loading}>
            <LineChartContainer
              data={{
                labels: movement.labels,
                datasets: [
                  { label: "Stock In", data: movement.qtyIn, borderColor: chartPalette[1], backgroundColor: chartPalette[1] },
                  { label: "Stock Out", data: movement.qtyOut, borderColor: chartPalette[5], backgroundColor: chartPalette[5] },
                ],
              }}
              options={{
                plugins: {
                  legend: {
                    display: true,
                    position: "bottom",
                    labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle" },
                  },
                },
              }}
            />
          </ChartCard>
        </div>
      </TabsContent>

      {/* ---------------- Procurement ---------------- */}
      <TabsContent value="procurement" className="pt-3">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon={Wallet} label="Procurement This Month">
              {loading ? <Skeleton className="h-7 w-28" /> : <CurrencyDisplay amount={procurementThisMonth} className="text-[22px] font-semibold" />}
            </StatTile>
            <StatTile icon={Clock3} label="Pending Approvals">
              {loading ? <Skeleton className="h-7 w-16" /> : pendingApprovals}
            </StatTile>
            <StatTile icon={Clock3} label="Average Approval Time">
              {loading ? <Skeleton className="h-7 w-20" /> : avgDays === null ? "—" : `${avgDays.toFixed(1)} days`}
            </StatTile>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Department Procurement Activity (₱)" icon={Building2} loading={loading}>
              <BarChartContainer
                data={{
                  labels: deptProcurement.map(([k]) => k),
                  datasets: [
                    { label: "PO Value", data: deptProcurement.map(([, v]) => v), backgroundColor: chartPalette[0], borderRadius: 6, maxBarThickness: 28 },
                  ],
                }}
              />
            </ChartCard>
            <ContainerCard padded>
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-neutral-600" />
                <h3 className="text-[14px] font-semibold text-neutral-900">Supplier Activity</h3>
              </div>
              {loading ? (
                <Skeleton className="h-[200px] w-full rounded-lg" />
              ) : (
                <div className="overflow-hidden rounded-lg border border-neutral-200">
                  <Table minWidth={0} className="min-w-full">
                    <TableHeader>
                      <TableHeaderRow>
                        <TableHead first>Supplier</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Total Value</TableHead>
                      </TableHeaderRow>
                    </TableHeader>
                    <TableBody>
                      {suppliers.slice(0, 6).map((s) => (
                        <TableRow key={s.name}>
                          <TableCell first className="py-2">{s.name}</TableCell>
                          <TableCell className="py-2 text-right tabular-nums">{s.orders}</TableCell>
                          <TableCell className="py-2 text-right">
                            <CurrencyDisplay amount={s.value} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ContainerCard>
          </div>
        </div>
      </TabsContent>

      {/* ---------------- Inventory ---------------- */}
      <TabsContent value="inventory" className="pt-3">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon={Wallet} label="Inventory Value">
              {loading ? <Skeleton className="h-7 w-28" /> : <CurrencyDisplay amount={invValue} className="text-[22px] font-semibold" />}
            </StatTile>
            <StatTile icon={Boxes} label="Low Stock Items">
              {loading ? <Skeleton className="h-7 w-16" /> : low.length}
            </StatTile>
            <StatTile icon={PackageX} label="Out of Stock Items">
              {loading ? <Skeleton className="h-7 w-16" /> : out.length}
            </StatTile>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ContainerCard padded>
              <div className="mb-4 flex items-center gap-2">
                <Boxes className="h-4 w-4 text-neutral-600" />
                <h3 className="text-[14px] font-semibold text-neutral-900">Most Requested Items</h3>
              </div>
              <ul className="space-y-3">
                {mostRequested.map(([name, qty]) => (
                  <li key={name}>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="text-neutral-700">{name}</span>
                      <span className="tabular-nums text-neutral-500">{qty} issued</span>
                    </div>
                    <ProgressBar value={(qty / maxRequested) * 100} tone="neutral" className="mt-1.5" />
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-neutral-100 pt-3">
                <OverlineLabel>Least Requested</OverlineLabel>
                <ul className="mt-1.5 space-y-1">
                  {leastRequested.map(([name, qty]) => (
                    <li key={name} className="flex items-center justify-between text-[11.5px]">
                      <span className="text-neutral-600">{name}</span>
                      <span className="tabular-nums text-neutral-400">{qty} issued</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ContainerCard>
            <ContainerCard padded>
              <div className="mb-3 flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-neutral-600" />
                <h3 className="text-[14px] font-semibold text-neutral-900">Recent Stock Movements</h3>
              </div>
              {loading ? (
                <Skeleton className="h-[220px] w-full rounded-lg" />
              ) : (
                <div className="overflow-hidden rounded-lg border border-neutral-200">
                  <Table minWidth={0} className="min-w-full">
                    <TableHeader>
                      <TableHeaderRow>
                        <TableHead first>Reference</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableHeaderRow>
                    </TableHeader>
                    <TableBody>
                      {recentMovements.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell first className="whitespace-nowrap py-2 font-medium text-neutral-800">
                            {e.documentNumber}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate py-2 text-neutral-600">
                            {e.itemName}
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums">
                            {e.quantityIn > 0 ? (
                              <span className="text-(--tone-settled)">+{e.quantityIn}</span>
                            ) : (
                              <span className="text-red-600">−{e.quantityOut}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums text-neutral-500">
                            {e.balance}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Caption as="p" className="mt-2 text-[10.5px]">
                Movements from POs, RIS releases, adjustments, returns, and corrections.
              </Caption>
            </ContainerCard>
          </div>
        </div>
      </TabsContent>

      {/* ---------------- Facilities ---------------- */}
      <TabsContent value="facilities" className="pt-3">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon={Building2} label="Most Reserved Facility">
              {loading ? <Skeleton className="h-7 w-32" /> : (
                <span className="text-[16px]">{facCounts[0]?.[0] ?? "—"}</span>
              )}
            </StatTile>
            <StatTile icon={CalendarDays} label="Reservation Frequency">
              {loading ? <Skeleton className="h-7 w-24" /> : `${perWeek.toFixed(1)} / week`}
            </StatTile>
            <StatTile icon={Clock3} label="Peak Hour">
              {loading ? <Skeleton className="h-7 w-16" /> : (() => {
                const max = Math.max(...hours.counts);
                const idx = hours.counts.indexOf(max);
                return max > 0 ? hours.labels[idx] : "—";
              })()}
            </StatTile>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <ChartCard title="Most Reserved Facilities" icon={Building2} loading={loading}>
              <BarChartContainer
                data={{
                  labels: facCounts.map(([k]) => k),
                  datasets: [
                    { label: "Reservations", data: facCounts.map(([, v]) => v), backgroundColor: chartPalette[2], borderRadius: 6, maxBarThickness: 28 },
                  ],
                }}
                options={{ indexAxis: "y" }}
              />
            </ChartCard>
            <ChartCard title="Peak Reservation Hours" icon={Clock3} loading={loading}>
              <BarChartContainer
                data={{
                  labels: hours.labels,
                  datasets: [
                    { label: "Bookings", data: hours.counts, backgroundColor: chartPalette[4], borderRadius: 6, maxBarThickness: 22 },
                  ],
                }}
              />
            </ChartCard>
            <ChartCard title="Reservation Trend" icon={CalendarDays} loading={loading}>
              <LineChartContainer
                data={{
                  labels,
                  datasets: [
                    {
                      label: "Reservations",
                      data: resTrend,
                      borderColor: chartPalette[0],
                      backgroundColor: chartPalette[0] + "22",
                      fill: true,
                    },
                  ],
                }}
              />
            </ChartCard>
          </div>
        </div>
      </TabsContent>

      {/* ---------------- Energy ---------------- */}
      <TabsContent value="energy" className="pt-3">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon={Wallet} label={`${monthName(energyMonth)} Electricity Expense`}>
              {loading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                <CurrencyDisplay
                  amount={energyOverall.currentTotal}
                  className="text-[22px] font-semibold"
                />
              )}
            </StatTile>
            <StatTile icon={Zap} label={`${monthName(energyMonth)} Consumption (KW)`}>
              {loading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                energyMonthKw.toLocaleString("en-PH", { maximumFractionDigits: 0 })
              )}
            </StatTile>
            <StatTile icon={Gauge} label="Highest Consuming Account">
              {loading ? (
                <Skeleton className="h-7 w-32" />
              ) : (
                <span className="text-[16px]">
                  {energyRanked[0] ? accountLabel(energyRanked[0].account) : "—"}
                </span>
              )}
            </StatTile>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <ChartCard title="Monthly Energy Expense Trend" icon={TrendingUp} loading={loading}>
              <LineChartContainer
                data={{
                  labels: energyPeriods.map((p) => p.label),
                  datasets: [
                    {
                      label: "Total Expense",
                      data: energyTrend,
                      borderColor: chartPalette[0],
                      backgroundColor: chartPalette[0] + "22",
                      fill: true,
                    },
                  ],
                }}
              />
            </ChartCard>
            <ChartCard title="Per Account Consumption" icon={BarChart3} loading={loading}>
              <BarChartContainer
                data={{
                  labels: energyTopAccounts.map((c) => accountLabel(c.account)),
                  datasets: [
                    {
                      label: monthName(energyMonth),
                      data: energyTopAccounts.map((c) => c.current ?? 0),
                      backgroundColor: chartPalette[2],
                      borderRadius: 6,
                      maxBarThickness: 28,
                    },
                  ],
                }}
                options={{ indexAxis: "y" }}
              />
            </ChartCard>
            <ChartCard title="Increase vs Decrease Accounts" icon={PieChart} loading={loading}>
              <DonutChartContainer
                data={{
                  labels: ["Increased", "Decreased", "No Change"],
                  datasets: [
                    {
                      data: [
                        energyOverall.increased,
                        energyOverall.decreased,
                        energyOverall.unchanged,
                      ],
                      // Increased / Decreased / No Change, in the same seal
                      // tones the status tags use for halted, settled and inert
                      // — a rise in municipal spend is the exception to flag.
                      backgroundColor: ["#7a1d2b", "#1f5c3a", "#c9c4bb"],
                      borderWidth: 2,
                      borderColor: "#ffffff",
                    },
                  ],
                }}
              />
            </ChartCard>
          </div>
        </div>
      </TabsContent>

      {/* ---------------- Water ---------------- */}
      <TabsContent value="water" className="pt-3">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon={Wallet} label={`${monthName(energyMonth)} Water Expense`}>
              {loading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                <CurrencyDisplay
                  amount={waterOverall.currentTotal}
                  className="text-[22px] font-semibold"
                />
              )}
            </StatTile>
            <StatTile icon={Droplets} label={`${monthName(energyMonth)} Consumption (m³)`}>
              {loading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                waterMonthVolume.toLocaleString("en-PH", { maximumFractionDigits: 0 })
              )}
            </StatTile>
            <StatTile icon={Gauge} label="Highest Consuming Account">
              {loading ? (
                <Skeleton className="h-7 w-32" />
              ) : (
                <span className="text-[16px]">
                  {waterRanked[0] ? waterAccountLabel(waterRanked[0].account) : "—"}
                </span>
              )}
            </StatTile>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <ChartCard title="Monthly Water Expense Trend" icon={TrendingUp} loading={loading}>
              <LineChartContainer
                data={{
                  labels: waterPeriods.map((p) => p.label),
                  datasets: [
                    {
                      label: "Total Expense",
                      data: waterTrend,
                      borderColor: chartPalette[1],
                      backgroundColor: chartPalette[1] + "22",
                      fill: true,
                    },
                  ],
                }}
              />
            </ChartCard>
            <ChartCard title="Per Account Consumption" icon={BarChart3} loading={loading}>
              <BarChartContainer
                data={{
                  labels: waterTopAccounts.map((c) => waterAccountLabel(c.account)),
                  datasets: [
                    {
                      label: monthName(energyMonth),
                      data: waterTopAccounts.map((c) => c.current ?? 0),
                      backgroundColor: chartPalette[1],
                      borderRadius: 6,
                      maxBarThickness: 28,
                    },
                  ],
                }}
                options={{ indexAxis: "y" }}
              />
            </ChartCard>
            <ChartCard title="Increase vs Decrease Accounts" icon={PieChart} loading={loading}>
              <DonutChartContainer
                data={{
                  labels: ["Increased", "Decreased", "No Change"],
                  datasets: [
                    {
                      data: [
                        waterOverall.increased,
                        waterOverall.decreased,
                        waterOverall.unchanged,
                      ],
                      // Increased / Decreased / No Change, in the same seal
                      // tones the status tags use for halted, settled and inert
                      // — a rise in municipal spend is the exception to flag.
                      backgroundColor: ["#7a1d2b", "#1f5c3a", "#c9c4bb"],
                      borderWidth: 2,
                      borderColor: "#ffffff",
                    },
                  ],
                }}
              />
            </ChartCard>
          </div>
        </div>
      </TabsContent>

      {/* ---------------- Fuel ---------------- */}
      <TabsContent value="fuel" className="pt-3">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon={Wallet} label={`${monthName(energyMonth)} Fuel Expense`}>
              {loading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                <CurrencyDisplay
                  amount={fuelOverall.currentTotal}
                  className="text-[22px] font-semibold"
                />
              )}
            </StatTile>
            <StatTile icon={Fuel} label={`${monthName(energyMonth)} Volume (Liters)`}>
              {loading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                fuelOverall.currentLiters.toLocaleString("en-PH", { maximumFractionDigits: 0 })
              )}
            </StatTile>
            <StatTile icon={Car} label="Highest Consuming Vehicle">
              {loading ? (
                <Skeleton className="h-7 w-32" />
              ) : (
                <span className="text-[16px]">
                  {fuelRanked[0] ? vehicleLabel(fuelRanked[0].vehicle) : "—"}
                </span>
              )}
            </StatTile>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <ChartCard title="Monthly Fuel Expense Trend" icon={TrendingUp} loading={loading}>
              <LineChartContainer
                data={{
                  labels: fuelPeriods.map((p) => p.label),
                  datasets: [
                    {
                      label: "Total Expense",
                      data: fuelTrend,
                      borderColor: chartPalette[3],
                      backgroundColor: chartPalette[3] + "22",
                      fill: true,
                    },
                  ],
                }}
              />
            </ChartCard>
            <ChartCard title="Consumption Per Vehicle" icon={BarChart3} loading={loading}>
              <BarChartContainer
                data={{
                  labels: fuelTopVehicles.map((c) => vehicleLabel(c.vehicle)),
                  datasets: [
                    {
                      label: monthName(energyMonth),
                      data: fuelTopVehicles.map((c) => c.current ?? 0),
                      backgroundColor: chartPalette[3],
                      borderRadius: 6,
                      maxBarThickness: 28,
                    },
                  ],
                }}
                options={{ indexAxis: "y" }}
              />
            </ChartCard>
            <ChartCard title="Increase vs Decrease Vehicles" icon={PieChart} loading={loading}>
              <DonutChartContainer
                data={{
                  labels: ["Increased", "Decreased", "No Change"],
                  datasets: [
                    {
                      data: [fuelOverall.increased, fuelOverall.decreased, fuelOverall.unchanged],
                      // Increased / Decreased / No Change, in the same seal
                      // tones the status tags use for halted, settled and inert
                      // — a rise in municipal spend is the exception to flag.
                      backgroundColor: ["#7a1d2b", "#1f5c3a", "#c9c4bb"],
                      borderWidth: 2,
                      borderColor: "#ffffff",
                    },
                  ],
                }}
              />
            </ChartCard>
            <ChartCard title="Expense by Fuel Type" icon={PieChart} loading={loading}>
              <DonutChartContainer
                data={{
                  labels: fuelSplit.map((s) => s.type),
                  datasets: [
                    {
                      data: fuelSplit.map((s) => s.amount),
                      backgroundColor: chartPalette.slice(0, Math.max(fuelSplit.length, 1)),
                      borderWidth: 2,
                      borderColor: "#ffffff",
                    },
                  ],
                }}
              />
            </ChartCard>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
