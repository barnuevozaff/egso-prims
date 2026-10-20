import * as React from "react";
import { format } from "date-fns";
import { Ban, Building2, Fuel, Gauge, History, Pencil, Plus, Route } from "lucide-react";

import {
  BarChartContainer,
  Caption,
  Button,
  CurrencyDisplay,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  EmptyState,
  IconButton,
  OverlineLabel,
  SectionTitle,
  Skeleton,
  SkeletonText,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
  chartPalette,
} from "@/components";
import {
  voidFuelOdometerReading,
  voidFuelTransaction,
  voidFuelTrip,
} from "@/features/fuel/api";
import {
  useFuelOdometerReadings,
  useFuelTransactions,
  useFuelTrips,
} from "@/features/fuel/hooks";
import {
  buildComparisons,
  buildVehicleHistory,
  comparisonLabel,
  kmPerLiter,
  monthlyTotals,
  odometerOf,
  trailingPeriods,
  vehicleLabel,
} from "@/features/fuel/lib";
import {
  periodLabel,
  type FuelOdometerReading,
  type FuelTransaction,
  type FuelTrip,
  type FuelVehicle,
} from "@/features/fuel/types";
import { departmentByCode } from "@/features/purchase-requests/types";
import { useAuth } from "@/features/auth/auth-context";
import { activeOnly, hasHistory } from "@/features/shared/revisions";
import { RecordHistoryDialog, VoidRecordDialog } from "@/features/shared/void-record";

/** Right slide-over: vehicle details, movement, and full transaction history. */
export function FuelVehicleDrawer({
  vehicle,
  open,
  onOpenChange,
  month,
  year,
  onEdit,
  onAddTrip: addTrip,
  onEditTrip,
  onAddTransaction: addTransaction,
  onEditTransaction,
  onAddReading: addReading,
  onEditReading,
  onChanged,
}: {
  vehicle: FuelVehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Period the dashboard is currently showing. */
  month: number;
  year: number;
  onEdit: (vehicle: FuelVehicle) => void;
  onAddTrip?: (vehicle: FuelVehicle) => void;
  onEditTrip?: (vehicle: FuelVehicle, trip: FuelTrip) => void;
  onAddTransaction: (vehicle: FuelVehicle) => void;
  onEditTransaction: (vehicle: FuelVehicle, transaction: FuelTransaction) => void;
  onAddReading?: (vehicle: FuelVehicle) => void;
  onEditReading?: (vehicle: FuelVehicle, reading: FuelOdometerReading) => void;
  onChanged?: () => void;
}) {
  const { data: transactions, loading, refresh } = useFuelTransactions(
    vehicle ? { vehicleId: vehicle.id, includeVoided: true } : { vehicleId: "__none__" },
  );
  const odometer = useFuelOdometerReadings(
    React.useMemo(
      () => ({ vehicleId: vehicle ? vehicle.id : "__none__", includeVoided: true }),
      [vehicle],
    ),
  );
  const trips = useFuelTrips(
    React.useMemo(
      () => (vehicle ? { vehicleId: vehicle.id, includeVoided: true } : { vehicleId: "__none__" }),
      [vehicle],
    ),
  );
  // Voided purchases and trips stay in these histories but no longer count.
  const activeTransactions = activeOnly(transactions);
  const [pendingTxnVoid, setPendingTxnVoid] = React.useState<FuelTransaction | null>(null);
  const [pendingTripVoid, setPendingTripVoid] = React.useState<FuelTrip | null>(null);
  const [historyFor, setHistoryFor] = React.useState<{
    title: string;
    record: FuelTrip | FuelTransaction | FuelOdometerReading;
  } | null>(null);
  const { user } = useAuth();
  // Voiding a finalized record is the Administrator's (policy 2026-10-20).
  const isAdmin = user?.role === "Administrator";
  const [pendingReadingVoid, setPendingReadingVoid] =
    React.useState<FuelOdometerReading | null>(null);
  // An inactive vehicle takes no new trips, purchases or readings until it
  // is set Active again (approved 2026-10-21); its history stays.
  const closed = !!vehicle && vehicle.status !== "Active";
  const onAddTrip = closed ? undefined : addTrip;
  const onAddTransaction = closed ? undefined : addTransaction;
  const onAddReading = closed ? undefined : addReading;

  const readings = React.useMemo(
    () => (vehicle ? odometerOf(odometer.data, vehicle.id) : []),
    [odometer.data, vehicle],
  );
  // Voided readings stay in the history, marked, but leave the totals.
  const odoTotals = React.useMemo(() => {
    const counted = activeOnly(readings);
    const distance = counted.reduce((s, r) => s + r.distance, 0);
    const liters = counted.reduce((s, r) => s + r.fuelLiters, 0);
    return { distance, liters, cost: counted.reduce((s, r) => s + r.fuelCost, 0) };
  }, [readings]);

  // Lifetime rollup across every recorded trip for this vehicle.
  const history = React.useMemo(
    () => (vehicle ? buildVehicleHistory(vehicle, activeOnly(trips.data)) : null),
    [vehicle, trips.data],
  );

  const comparison = vehicle ? buildComparisons([vehicle], activeTransactions, month, year)[0] : null;
  const periods = trailingPeriods(month, year, 6);
  const series = monthlyTotals(activeTransactions, periods);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="wide">
      {!vehicle ? (
        <div className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <SkeletonText lines={6} className="mt-6" />
        </div>
      ) : (
        <>
          <DrawerHeader
            title={vehicleLabel(vehicle)}
            description={`${vehicle.plateNumber} · ${vehicle.vehicleType}`}
            onClose={() => onOpenChange(false)}
          >
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge status={vehicle.status} />
              {comparison && <StatusBadge status={comparison.status} />}
              {closed && (
                <Caption className="text-[11.5px]">Set it Active to record new trips, purchases or readings.</Caption>
              )}
            </div>
          </DrawerHeader>

          <DrawerBody>
            <div className="space-y-5">
              {/* Vehicle information */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <OverlineLabel>Plate Number</OverlineLabel>
                  <div className="mt-0.5 text-[12.5px] tabular-nums text-neutral-800">
                    {vehicle.plateNumber}
                  </div>
                </div>
                <div>
                  <OverlineLabel>Fuel Type</OverlineLabel>
                  <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-neutral-800">
                    <Fuel className="h-3 w-3 text-neutral-400" />
                    {vehicle.fuelType}
                  </div>
                </div>
                <div>
                  <OverlineLabel>Vehicle Type</OverlineLabel>
                  <div className="mt-0.5 text-[12.5px] text-neutral-800">{vehicle.vehicleType}</div>
                </div>
                <div>
                  <OverlineLabel>Assigned Office</OverlineLabel>
                  <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-neutral-800">
                    <Building2 className="h-3 w-3 text-neutral-400" />
                    {departmentByCode(vehicle.officeCode)?.name ?? vehicle.officeCode}
                  </div>
                </div>
              </div>

              {/* Fuel configuration — the figures every trip computation reads */}
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-neutral-200 p-3">
                  <OverlineLabel>Tank Capacity</OverlineLabel>
                  <div className="mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                    {vehicle.tankCapacity.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                    <span className="ml-1 text-[11px] font-normal text-neutral-400">L</span>
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-200 p-3">
                  <OverlineLabel>Rated Efficiency</OverlineLabel>
                  <div className="mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                    {vehicle.kmPerLiter.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                    <span className="ml-1 text-[11px] font-normal text-neutral-400">km/L</span>
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-200 p-3">
                  <OverlineLabel>Current Fuel Balance</OverlineLabel>
                  <div
                    className={
                      "mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight " +
                      (vehicle.tankCapacity > 0 &&
                      vehicle.currentFuelBalance < vehicle.tankCapacity * 0.25
                        ? "text-amber-600"
                        : "text-neutral-900")
                    }
                  >
                    {vehicle.currentFuelBalance.toLocaleString("en-PH", {
                      maximumFractionDigits: 2,
                    })}
                    <span className="ml-1 text-[11px] font-normal text-neutral-400">L</span>
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-200 p-3">
                  <OverlineLabel>Current Odometer</OverlineLabel>
                  <div className="mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                    {history?.lastTrip
                      ? history.lastTrip.endingOdometer.toLocaleString("en-PH", {
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                    <span className="ml-1 text-[11px] font-normal text-neutral-400">km</span>
                  </div>
                </div>
              </section>

              {/* Lifetime trip history */}
              {history && (
                <section className="rounded-lg bg-neutral-50/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-neutral-900">
                      Vehicle History
                    </span>
                    {history.lastTrip && (
                      <span className="text-[11.5px] text-neutral-500">
                        Last trip {format(new Date(history.lastTrip.tripDate), "d MMM yyyy")} ·{" "}
                        {history.lastTrip.controlNo}
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 grid grid-cols-5 gap-3">
                    <div>
                      <OverlineLabel>Total Trips</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                        {history.totalTrips.toLocaleString("en-PH")}
                      </div>
                    </div>
                    <div>
                      <OverlineLabel>Total Distance</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                        {history.totalDistance.toLocaleString("en-PH", {
                          maximumFractionDigits: 0,
                        })}
                        <span className="ml-1 text-[11px] font-normal text-neutral-400">km</span>
                      </div>
                    </div>
                    <div>
                      <OverlineLabel>Fuel Used</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                        {history.totalFuelUsed.toLocaleString("en-PH", {
                          maximumFractionDigits: 2,
                        })}
                        <span className="ml-1 text-[11px] font-normal text-neutral-400">L</span>
                      </div>
                    </div>
                    <div>
                      <OverlineLabel>Fuel Added</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-700">
                        {history.totalFuelAdded.toLocaleString("en-PH", {
                          maximumFractionDigits: 2,
                        })}
                        <span className="ml-1 text-[11px] font-normal text-neutral-400">L</span>
                      </div>
                    </div>
                    <div>
                      <OverlineLabel>Average KM/L</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                        {history.averageKmPerLiter === null
                          ? "—"
                          : history.averageKmPerLiter.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Trip history */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <SectionTitle as="h3">Trip History</SectionTitle>
                  {onAddTrip && (
                    <Button variant="secondary" size="xs" onClick={() => onAddTrip(vehicle)}>
                      <Plus />
                      Add Trip
                    </Button>
                  )}
                </div>
                {trips.loading ? (
                  <SkeletonText lines={4} />
                ) : trips.data.length === 0 ? (
                  <EmptyState
                    icon={Route}
                    title="No trips recorded yet"
                    description="Record the first trip for this vehicle."
                    action={
                      onAddTrip ? { label: "Add Trip", onClick: () => onAddTrip(vehicle) } : undefined
                    }
                  />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-neutral-200">
                    <Table minWidth={0} className="min-w-full">
                      <TableHeader>
                        <TableHeaderRow>
                          <TableHead first>Control No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Purpose</TableHead>
                          <TableHead>Itinerary</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead className="text-right">Trips</TableHead>
                          <TableHead className="text-right">Odo. Out (km)</TableHead>
                          <TableHead className="text-right">Odo. In (km)</TableHead>
                          <TableHead className="text-right">Distance (km)</TableHead>
                          <TableHead className="text-right">Beginning (L)</TableHead>
                          <TableHead className="text-right">Added (L)</TableHead>
                          <TableHead className="text-right">Total (L)</TableHead>
                          <TableHead className="text-right">Used (L)</TableHead>
                          <TableHead className="text-right">Ending (L)</TableHead>
                          <TableHead className="text-right" />
                        </TableHeaderRow>
                      </TableHeader>
                      <TableBody>
                        {trips.data.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell
                              first
                              className="whitespace-nowrap py-2.5 font-medium tabular-nums text-neutral-800"
                            >
                              {t.controlNo}
                              {t.voided && (
                                <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#5b606b]">
                                  Voided
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap py-2.5 text-neutral-600">
                              {format(new Date(t.tripDate), "d MMM yyyy")}
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate py-2.5 text-neutral-600">
                              {t.purpose ?? "—"}
                            </TableCell>
                            <TableCell className="max-w-[170px] truncate py-2.5 text-neutral-600">
                              {t.origin || t.destination
                                ? `${t.origin ?? "—"} → ${t.destination ?? "—"}`
                                : "—"}
                            </TableCell>
                            <TableCell className="max-w-[130px] truncate py-2.5 text-neutral-600">
                              {t.driver ?? "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-600">
                              {t.noOfTrips}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-500">
                              {t.beginningOdometer.toLocaleString("en-PH", {
                                maximumFractionDigits: 0,
                              })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-500">
                              {t.endingOdometer.toLocaleString("en-PH", {
                                maximumFractionDigits: 0,
                              })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums font-medium text-neutral-900">
                              {t.distanceTravelled.toLocaleString("en-PH", {
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-500">
                              {t.beginningFuel.toLocaleString("en-PH", {
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-500">
                              {t.fuelAdded === 0
                                ? "—"
                                : t.fuelAdded.toLocaleString("en-PH", {
                                    maximumFractionDigits: 2,
                                  })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-600">
                              {t.fuelTotal.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums font-medium text-neutral-900">
                              {t.fuelUsed.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell
                              className={
                                "py-2.5 text-right tabular-nums font-medium " +
                                (t.endingFuel <= 0 ? "text-red-600" : "text-neutral-800")
                              }
                            >
                              {t.endingFuel.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span className="inline-flex items-center gap-1">
                                {onEditTrip && !t.voided && (
                                  <IconButton
                                    aria-label={`Correct trip ${t.controlNo}`}
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => onEditTrip(vehicle, t)}
                                  >
                                    <Pencil />
                                  </IconButton>
                                )}
                                {hasHistory(t) && (
                                  <IconButton
                                    aria-label={`History of trip ${t.controlNo}`}
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setHistoryFor({ title: `Trip ${t.controlNo} — history`, record: t })}
                                  >
                                    <History />
                                  </IconButton>
                                )}
                                {!t.voided && isAdmin && (
                                  <IconButton
                                    aria-label={`Void trip ${t.controlNo}`}
                                    variant="danger"
                                    size="icon-sm"
                                    onClick={() => setPendingTripVoid(t)}
                                  >
                                    <Ban />
                                  </IconButton>
                                )}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              {/* Month-over-month movement */}
              {comparison && (
                <section className="rounded-lg bg-neutral-50/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-neutral-900">
                      {periodLabel(month, year)} vs. previous month
                    </span>
                    <StatusBadge status={comparison.status} />
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <OverlineLabel>Current</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                        {comparison.current === null ? (
                          <span className="text-neutral-300">—</span>
                        ) : (
                          <CurrencyDisplay amount={comparison.current} className="text-[16px]" />
                        )}
                      </div>
                    </div>
                    <div>
                      <OverlineLabel>Previous</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-600">
                        {comparison.previous === null ? (
                          <span className="text-neutral-300">—</span>
                        ) : (
                          <CurrencyDisplay
                            amount={comparison.previous}
                            muted
                            className="text-[16px]"
                          />
                        )}
                      </div>
                    </div>
                    <div>
                      <OverlineLabel>Difference</OverlineLabel>
                      <div
                        className={
                          "text-[16px] font-semibold tabular-nums tracking-tight " +
                          (comparison.status === "Increased"
                            ? "text-red-600"
                            : comparison.status === "Decreased"
                              ? "text-(--tone-settled)"
                              : "text-neutral-500")
                        }
                      >
                        {comparison.status === "No Change"
                          ? "—"
                          : `${comparison.difference > 0 ? "+" : "−"}₱${Math.abs(
                              comparison.difference,
                            ).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`}
                      </div>
                    </div>
                    <div>
                      <OverlineLabel>Liters</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-700">
                        {comparison.currentLiters.toLocaleString("en-PH", {
                          maximumFractionDigits: 2,
                        })}
                        <span className="ml-1 text-[11px] font-normal text-neutral-400">
                          {comparison.litersDifference === 0
                            ? ""
                            : `(${comparison.litersDifference > 0 ? "+" : "−"}${Math.abs(
                                comparison.litersDifference,
                              ).toLocaleString("en-PH", { maximumFractionDigits: 2 })})`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[11.5px] text-neutral-600">
                    {comparisonLabel(comparison.status, comparison.difference, comparison.percent)}
                  </p>
                </section>
              )}

              {/* Six-month trend */}
              <section>
                <SectionTitle as="h3" className="mb-2">
                  Six-Month Fuel Expense
                </SectionTitle>
                <div className="rounded-lg border border-neutral-200 p-3">
                  {loading ? (
                    <Skeleton className="h-[180px] w-full rounded-lg" />
                  ) : (
                    <BarChartContainer
                      height={180}
                      data={{
                        labels: periods.map((p) => p.label),
                        datasets: [
                          {
                            label: "Amount",
                            data: series,
                            backgroundColor: chartPalette[3],
                            borderRadius: 6,
                            maxBarThickness: 34,
                          },
                        ],
                      }}
                    />
                  )}
                </div>
              </section>

              {/* Odometer totals */}
              {readings.length > 0 && (
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <OverlineLabel>Total Distance</OverlineLabel>
                    <div className="mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                      {odoTotals.distance.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                      <span className="ml-1 text-[11px] font-normal text-neutral-400">km</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <OverlineLabel>Total Liters</OverlineLabel>
                    <div className="mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                      {odoTotals.liters.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <OverlineLabel>Fuel Efficiency</OverlineLabel>
                    <div className="mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                      {(() => {
                        const e = kmPerLiter(odoTotals.distance, odoTotals.liters);
                        return e === null ? "—" : e.toFixed(2);
                      })()}
                      <span className="ml-1 text-[11px] font-normal text-neutral-400">km/L</span>
                    </div>
                  </div>
                </section>
              )}

              {/* Odometer reading history */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <SectionTitle as="h3">Odometer Reading History</SectionTitle>
                  {onAddReading && (
                    <Button variant="secondary" size="xs" onClick={() => onAddReading(vehicle)}>
                      <Plus />
                      Add Reading
                    </Button>
                  )}
                </div>
                {odometer.loading ? (
                  <SkeletonText lines={4} />
                ) : readings.length === 0 ? (
                  <EmptyState
                    icon={Gauge}
                    title="No odometer readings yet"
                    description="Record the first odometer reading for this vehicle."
                    action={
                      onAddReading
                        ? { label: "Add Reading", onClick: () => onAddReading(vehicle) }
                        : undefined
                    }
                  />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-neutral-200">
                    <Table minWidth={0} className="min-w-full">
                      <TableHeader>
                        <TableHeaderRow>
                          <TableHead first>Reading Date</TableHead>
                          <TableHead className="text-right">Previous</TableHead>
                          <TableHead className="text-right">Current</TableHead>
                          <TableHead className="text-right">Distance</TableHead>
                          <TableHead className="text-right">Liters</TableHead>
                          <TableHead className="text-right">Fuel Cost</TableHead>
                          <TableHead>Remarks</TableHead>
                          <TableHead className="text-right" />
                        </TableHeaderRow>
                      </TableHeader>
                      <TableBody>
                        {readings.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell
                              first
                              className="whitespace-nowrap py-2.5 font-medium text-neutral-800"
                            >
                              {format(new Date(r.readingDate), "d MMM yyyy")}
                              {r.voided && (
                                <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#5b606b]">
                                  Voided
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-500">
                              {r.previousOdometer.toLocaleString("en-PH", {
                                maximumFractionDigits: 0,
                              })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-800">
                              {r.currentOdometer.toLocaleString("en-PH", {
                                maximumFractionDigits: 0,
                              })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums font-medium text-neutral-900">
                              {r.distance.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                              <span className="ml-1 text-[10.5px] font-normal text-neutral-400">
                                km
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-700">
                              {r.fuelLiters.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <CurrencyDisplay amount={r.fuelCost} />
                            </TableCell>
                            <TableCell className="max-w-[130px] truncate py-2.5 text-neutral-500">
                              {r.remarks ?? "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span className="inline-flex items-center gap-1">
                                {onEditReading && !r.voided && (
                                  <IconButton
                                    aria-label={`Correct the reading of ${format(new Date(r.readingDate), "d MMM yyyy")}`}
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => onEditReading(vehicle, r)}
                                  >
                                    <Pencil />
                                  </IconButton>
                                )}
                                {hasHistory(r) && (
                                  <IconButton
                                    aria-label={`History of the reading of ${format(new Date(r.readingDate), "d MMM yyyy")}`}
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setHistoryFor({ title: `Odometer reading of ${format(new Date(r.readingDate), "d MMM yyyy")} — history`, record: r })}
                                  >
                                    <History />
                                  </IconButton>
                                )}
                                {!r.voided && isAdmin && (
                                  <IconButton
                                    aria-label={`Void the reading of ${format(new Date(r.readingDate), "d MMM yyyy")}`}
                                    variant="danger"
                                    size="icon-sm"
                                    onClick={() => setPendingReadingVoid(r)}
                                  >
                                    <Ban />
                                  </IconButton>
                                )}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              {/* Transaction history */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <SectionTitle as="h3">Fuel Transactions</SectionTitle>
                  {onAddTransaction && (
                    <Button variant="secondary" size="xs" onClick={() => onAddTransaction(vehicle)}>
                      <Plus />
                      Record Transaction
                    </Button>
                  )}
                </div>
                {loading ? (
                  <SkeletonText lines={5} />
                ) : transactions.length === 0 ? (
                  <EmptyState
                    icon={Fuel}
                    title="No fuel transactions yet"
                    description="Record the first fuel transaction for this vehicle."
                    action={
                      onAddTransaction
                        ? { label: "Record Transaction", onClick: () => onAddTransaction(vehicle) }
                        : undefined
                    }
                  />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-neutral-200">
                    <Table minWidth={0} className="min-w-full">
                      <TableHeader>
                        <TableHeaderRow>
                          <TableHead first>Date</TableHead>
                          <TableHead className="text-right">Liters</TableHead>
                          <TableHead className="text-right">Price/L</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead className="text-right">Odometer</TableHead>
                          <TableHead className="text-right" />
                        </TableHeaderRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell first className="whitespace-nowrap py-2.5">
                              <span className="font-medium text-neutral-800">
                                {format(new Date(t.txnDate), "d MMM yyyy")}
                              </span>
                              {t.docNumber && (
                                <span className="block text-[10.5px] tabular-nums text-neutral-400">
                                  {t.docNumber}
                                </span>
                              )}
                              {t.voided && (
                                <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#5b606b]">
                                  Voided
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-700">
                              {t.liters.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-500">
                              {t.pricePerLiter.toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <CurrencyDisplay amount={t.totalAmount} />
                            </TableCell>
                            <TableCell className="max-w-[140px] truncate py-2.5 text-neutral-500">
                              {t.driver ?? "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-500">
                              {t.odometer === undefined
                                ? "—"
                                : t.odometer.toLocaleString("en-PH", {
                                    maximumFractionDigits: 0,
                                  })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span className="inline-flex items-center gap-1">
                                {!t.voided && (
                                  <IconButton
                                    aria-label={`Correct transaction of ${format(new Date(t.txnDate), "d MMM yyyy")}`}
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => onEditTransaction(vehicle, t)}
                                  >
                                    <Pencil />
                                  </IconButton>
                                )}
                                {hasHistory(t) && (
                                  <IconButton
                                    aria-label={`History of transaction ${t.docNumber ?? format(new Date(t.txnDate), "d MMM yyyy")}`}
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setHistoryFor({ title: `${t.docNumber ?? "Fuel transaction"} — history`, record: t })}
                                  >
                                    <History />
                                  </IconButton>
                                )}
                                {!t.voided && isAdmin && (
                                  <IconButton
                                    aria-label={`Void transaction of ${format(new Date(t.txnDate), "d MMM yyyy")}`}
                                    variant="danger"
                                    size="icon-sm"
                                    onClick={() => setPendingTxnVoid(t)}
                                  >
                                    <Ban />
                                  </IconButton>
                                )}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <Caption as="p" className="mt-2 text-[10.5px]">
                  Registered {format(new Date(vehicle.createdAt), "d MMMM yyyy")} ·{" "}
                  {transactions.length} transaction{transactions.length === 1 ? "" : "s"}
                </Caption>
              </section>
            </div>
          </DrawerBody>

          <DrawerFooter>
            <DrawerActions>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button variant="secondary" onClick={() => onEdit(vehicle)}>
                <Pencil />
                Edit Vehicle
              </Button>
              {onAddTransaction && (
                <Button variant="secondary" onClick={() => onAddTransaction(vehicle)}>
                  <Plus />
                  Record Transaction
                </Button>
              )}
              {onAddTrip && (
                <Button onClick={() => onAddTrip(vehicle)}>
                  <Plus />
                  Add Trip
                </Button>
              )}
            </DrawerActions>
          </DrawerFooter>

          <VoidRecordDialog
            open={!!pendingTxnVoid}
            onOpenChange={(o) => !o && setPendingTxnVoid(null)}
            title={pendingTxnVoid ? `Void ${pendingTxnVoid.docNumber ?? "this fuel transaction"}?` : "Void fuel transaction?"}
            description="The purchase keeps its number and values and stays in this history, but no longer counts in totals or comparisons."
            onVoid={(reason) => voidFuelTransaction(pendingTxnVoid!.id, reason)}
            onDone={() => {
              setPendingTxnVoid(null);
              void refresh();
              onChanged?.();
            }}
          />

          <VoidRecordDialog
            open={!!pendingTripVoid}
            onOpenChange={(o) => !o && setPendingTripVoid(null)}
            title={pendingTripVoid ? `Void trip ${pendingTripVoid.controlNo}?` : "Void trip?"}
            description="The trip keeps its control number and values and stays in this history, but no longer counts; the vehicle's fuel balance is taken from its remaining trips."
            onVoid={(reason) => voidFuelTrip(pendingTripVoid!.id, reason)}
            onDone={() => {
              setPendingTripVoid(null);
              void trips.refresh();
              onChanged?.();
            }}
          />

          <RecordHistoryDialog
            open={!!historyFor}
            onOpenChange={(o) => !o && setHistoryFor(null)}
            title={historyFor?.title ?? "History"}
            record={historyFor?.record ?? null}
          />

          <VoidRecordDialog
            open={!!pendingReadingVoid}
            onOpenChange={(o) => !o && setPendingReadingVoid(null)}
            title={
              pendingReadingVoid
                ? `Void the odometer reading of ${format(new Date(pendingReadingVoid.readingDate), "d MMM yyyy")}?`
                : "Void odometer reading?"
            }
            description="The reading keeps its values and stays in this history, marked voided with your reason, your name and the time. It no longer counts in totals. Later readings keep their own recorded previous values."
            onVoid={(reason) => voidFuelOdometerReading(pendingReadingVoid!.id, reason)}
            onDone={() => {
              setPendingReadingVoid(null);
              void odometer.refresh();
              onChanged?.();
            }}
          />
        </>
      )}
    </Drawer>
  );
}
