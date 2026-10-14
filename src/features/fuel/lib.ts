import { formatPHP } from "@/lib/format";
import type {
  ComparisonStatus,
  FuelOdometerReading,
  FuelTransaction,
  FuelTrip,
  FuelVehicle,
  OverallComparison,
  VehicleComparison,
  VehicleTripHistory,
} from "@/features/fuel/types";
import {
  classifyMovement as classify,
  previousPeriod,
  trailingPeriods,
} from "@/features/shared/periods";

// Re-exported so existing imports from this module keep working unchanged.
export { previousPeriod, trailingPeriods };

/** True when the transaction falls inside the given billing period. */
export function inPeriod(t: FuelTransaction, month: number, year: number): boolean {
  const d = new Date(t.txnDate);
  return d.getMonth() + 1 === month && d.getFullYear() === year;
}

/**
 * Fuel is recorded as many transactions per vehicle per month, so a period
 * total is the sum of its fill-ups rather than a single bill.
 */
export function periodTotals(
  transactions: FuelTransaction[],
  vehicleId: string,
  month: number,
  year: number,
): { amount: number; liters: number; count: number } {
  const rows = transactions.filter((t) => t.vehicleId === vehicleId && inPeriod(t, month, year));
  return {
    amount: rows.reduce((s, t) => s + t.totalAmount, 0),
    liters: rows.reduce((s, t) => s + t.liters, 0),
    count: rows.length,
  };
}

/**
 * Month-over-month movement per vehicle for the selected period. Vehicles
 * without any fill-up in either month still appear, with null amounts.
 */
export function buildComparisons(
  vehicles: FuelVehicle[],
  transactions: FuelTransaction[],
  month: number,
  year: number,
): VehicleComparison[] {
  const prev = previousPeriod(month, year);
  return vehicles.map((vehicle) => {
    const cur = periodTotals(transactions, vehicle.id, month, year);
    const pre = periodTotals(transactions, vehicle.id, prev.month, prev.year);
    const current = cur.count > 0 ? cur.amount : null;
    const previous = pre.count > 0 ? pre.amount : null;
    const difference = current !== null && previous !== null ? current - previous : 0;
    const percent =
      current !== null && previous !== null && previous !== 0 ? (difference / previous) * 100 : null;
    return {
      vehicle,
      current,
      previous,
      currentLiters: cur.liters,
      previousLiters: pre.liters,
      difference,
      litersDifference: cur.liters - pre.liters,
      percent,
      status: classify(current, previous),
      avgPricePerLiter: cur.liters > 0 ? cur.amount / cur.liters : null,
    };
  });
}

/** Combined movement across every vehicle for the selected period. */
export function buildOverall(comparisons: VehicleComparison[]): OverallComparison {
  const currentTotal = comparisons.reduce((s, c) => s + (c.current ?? 0), 0);
  const previousTotal = comparisons.reduce((s, c) => s + (c.previous ?? 0), 0);
  const currentLiters = comparisons.reduce((s, c) => s + c.currentLiters, 0);
  const previousLiters = comparisons.reduce((s, c) => s + c.previousLiters, 0);
  const difference = currentTotal - previousTotal;
  const percent = previousTotal !== 0 ? (difference / previousTotal) * 100 : null;
  return {
    currentTotal,
    previousTotal,
    currentLiters,
    previousLiters,
    difference,
    litersDifference: currentLiters - previousLiters,
    percent,
    status: classify(currentTotal, previousTotal || null),
    increased: comparisons.filter((c) => c.status === "Increased").length,
    decreased: comparisons.filter((c) => c.status === "Decreased").length,
    unchanged: comparisons.filter((c) => c.status === "No Change").length,
    vehicles: comparisons.length,
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
  if (overall.currentTotal === 0) return "No fuel transactions recorded for this month yet";
  if (overall.status === "No Change") return "Overall Fuel Consumption unchanged";
  const arrow = overall.status === "Increased" ? "▲" : "▼";
  const pct = overall.percent === null ? "" : ` (${Math.abs(overall.percent).toFixed(2)}%)`;
  return `${arrow} Overall Fuel Consumption ${overall.status} by ${formatPHP(
    Math.abs(overall.difference),
  )}${pct}`;
}

/** Combined fuel expense per period, for the monthly trend chart. */
export function monthlyTotals(
  transactions: FuelTransaction[],
  periods: { month: number; year: number }[],
): number[] {
  return periods.map((p) =>
    transactions
      .filter((t) => inPeriod(t, p.month, p.year))
      .reduce((s, t) => s + t.totalAmount, 0),
  );
}

/** Spend split by fuel type for the selected period. */
export function fuelTypeSplit(
  transactions: FuelTransaction[],
  month: number,
  year: number,
): { type: string; amount: number; liters: number }[] {
  const rows = transactions.filter((t) => inPeriod(t, month, year));
  const map = new Map<string, { amount: number; liters: number }>();
  for (const t of rows) {
    const e = map.get(t.fuelType) ?? { amount: 0, liters: 0 };
    e.amount += t.totalAmount;
    e.liters += t.liters;
    map.set(t.fuelType, e);
  }
  return [...map.entries()]
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.amount - a.amount);
}

/** Distinct billing years present in the data, newest first. */
export function transactionYears(transactions: FuelTransaction[]): number[] {
  const years = [...new Set(transactions.map((t) => new Date(t.txnDate).getFullYear()))].sort(
    (a, b) => b - a,
  );
  return years.length > 0 ? years : [new Date().getFullYear()];
}

export const vehicleLabel = (v: FuelVehicle) => v.vehicleName || v.plateNumber;

/* ---------------- odometer readings ---------------- */

/** Readings for one vehicle, newest reading date first. */
export function odometerOf(
  readings: FuelOdometerReading[],
  vehicleId: string,
): FuelOdometerReading[] {
  return readings
    .filter((r) => r.vehicleId === vehicleId)
    .sort((a, b) => b.readingDate.localeCompare(a.readingDate));
}

/**
 * The reading a new entry continues from. Its current odometer becomes the
 * next entry's previous odometer, so the value never has to be retyped.
 */
export function latestOdometer(
  readings: FuelOdometerReading[],
  vehicleId: string,
): FuelOdometerReading | null {
  return odometerOf(readings, vehicleId)[0] ?? null;
}

/**
 * Distance, litres and cost a vehicle's odometer readings record for a year.
 * Returns null totals when the vehicle has no readings in that year.
 */
export function odometerYearTotals(
  readings: FuelOdometerReading[],
  vehicleId: string,
  year: number,
): { distance: number; liters: number; cost: number; count: number } {
  const rows = readings.filter(
    (r) => r.vehicleId === vehicleId && new Date(r.readingDate).getFullYear() === year,
  );
  return {
    distance: rows.reduce((s, r) => s + r.distance, 0),
    liters: rows.reduce((s, r) => s + r.fuelLiters, 0),
    cost: rows.reduce((s, r) => s + r.fuelCost, 0),
    count: rows.length,
  };
}

/** Kilometres per litre, or null when either side is zero. */
export const kmPerLiter = (distance: number, liters: number) =>
  liters > 0 && distance > 0 ? distance / liters : null;

/* ============================================================
 * Trip-based fuel monitoring
 *
 * These are the single source of truth for every computed figure. The form
 * previews with them and the database recomputes the same expressions in
 * generated columns, so the two can never disagree.
 * ============================================================ */

/** Litres/kilometres are carried to two decimals throughout the module. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Distance Travelled = Odometer IN − Odometer OUT. */
export function tripDistance(beginningOdometer: number, endingOdometer: number): number {
  return round2(Math.max(0, endingOdometer - beginningOdometer));
}

/** Fuel Used = Distance ÷ KM per litre. Never entered by hand. */
export function tripFuelUsed(distance: number, kmPerLiter: number): number {
  if (!(kmPerLiter > 0)) return 0;
  return round2(distance / kmPerLiter);
}

/** Ending Fuel = Beginning + Added − Used. Never entered by hand. */
export function tripEndingFuel(
  beginningFuel: number,
  fuelAdded: number,
  fuelUsed: number,
): number {
  return round2(beginningFuel + fuelAdded - fuelUsed);
}

export interface TripComputationInput {
  beginningOdometer: number;
  endingOdometer: number;
  kmPerLiter: number;
  beginningFuel: number;
  fuelAdded: number;
}

export interface TripComputation {
  distance: number;
  /** Beginning + Added — the sheet's TOTAL column. */
  fuelTotal: number;
  fuelUsed: number;
  endingFuel: number;
}

/** Recomputes every derived figure for a trip in one pass. */
export function computeTrip(input: TripComputationInput): TripComputation {
  const distance = tripDistance(input.beginningOdometer, input.endingOdometer);
  const fuelUsed = tripFuelUsed(distance, input.kmPerLiter);
  const fuelTotal = round2(input.beginningFuel + input.fuelAdded);
  return {
    distance,
    fuelTotal,
    fuelUsed,
    endingFuel: round2(fuelTotal - fuelUsed),
  };
}

/** Actual efficiency achieved: distance ÷ fuel used. Null until both exist. */
export function achievedKmPerLiter(distance: number, fuelUsed: number): number | null {
  return fuelUsed > 0 && distance > 0 ? round2(distance / fuelUsed) : null;
}

/* ---------------- validation ---------------- */

export interface TripValidation {
  /** Blocking messages keyed by field; save is prevented while non-empty. */
  errors: Partial<Record<"endingOdometer" | "endingFuel" | "controlNo" | "vehicleId", string>>;
  /** Non-blocking advisories (e.g. over-tank purchase). */
  warnings: string[];
}

/**
 * Business rules from the Trip Summary sheet:
 *  • the odometer may not run backwards,
 *  • a trip may not consume fuel the tank never had,
 *  • a purchase larger than the tank is flagged but still allowed.
 */
export function validateTrip(
  input: TripComputationInput & { controlNo?: string; vehicleId: string },
  computed: TripComputation,
  tankCapacity: number,
): TripValidation {
  const errors: TripValidation["errors"] = {};
  const warnings: string[] = [];

  if (!input.vehicleId) errors.vehicleId = "Select a vehicle.";
  // Control numbers are issued by the service on save, so an absent value is
  // only an error when the caller is editing a row that already has one.
  if (input.controlNo !== undefined && !input.controlNo.trim()) {
    errors.controlNo = "Control number is required.";
  }
  if (input.endingOdometer < input.beginningOdometer) {
    errors.endingOdometer = "Odometer IN cannot be lower than Odometer OUT.";
  }
  if (computed.endingFuel < 0) {
    errors.endingFuel = "Insufficient fuel.";
  }
  if (tankCapacity > 0 && computed.fuelTotal > tankCapacity) {
    warnings.push(
      `Total fuel (${computed.fuelTotal} L) exceeds the ${tankCapacity} L tank capacity.`,
    );
  }
  return { errors, warnings };
}

export const hasTripErrors = (v: TripValidation) => Object.keys(v.errors).length > 0;

/* ---------------- history & rollups ---------------- */

/** Trips belonging to one vehicle, newest first. */
export function tripsOf(trips: FuelTrip[], vehicleId: string): FuelTrip[] {
  return trips
    .filter((t) => t.vehicleId === vehicleId)
    .sort((a, b) => (a.tripDate < b.tripDate ? 1 : a.tripDate > b.tripDate ? -1 : 0));
}

/** Totals, average efficiency and last trip for one vehicle. */
export function buildVehicleHistory(
  vehicle: FuelVehicle,
  trips: FuelTrip[],
): VehicleTripHistory {
  const rows = tripsOf(trips, vehicle.id);
  const totalDistance = round2(rows.reduce((s, t) => s + t.distanceTravelled, 0));
  const totalFuelUsed = round2(rows.reduce((s, t) => s + t.fuelUsed, 0));
  return {
    totalTrips: rows.reduce((s, t) => s + (t.noOfTrips || 1), 0),
    totalDistance,
    totalFuelUsed,
    totalFuelAdded: round2(rows.reduce((s, t) => s + t.fuelAdded, 0)),
    averageKmPerLiter: achievedKmPerLiter(totalDistance, totalFuelUsed),
    lastTrip: rows[0] ?? null,
    currentFuelBalance: vehicle.currentFuelBalance,
  };
}

/** True when the trip falls inside the given month/year. */
export function tripInPeriod(t: FuelTrip, month: number, year: number): boolean {
  const d = new Date(t.tripDate);
  return d.getMonth() + 1 === month && d.getFullYear() === year;
}

export interface TripTotals {
  trips: number;
  distance: number;
  fuelUsed: number;
  fuelAdded: number;
  averageKmPerLiter: number | null;
}

/** Aggregate a set of trips — used by the dashboard cards and the reports. */
export function summariseTrips(trips: FuelTrip[]): TripTotals {
  const distance = round2(trips.reduce((s, t) => s + t.distanceTravelled, 0));
  const fuelUsed = round2(trips.reduce((s, t) => s + t.fuelUsed, 0));
  return {
    trips: trips.reduce((s, t) => s + (t.noOfTrips || 1), 0),
    distance,
    fuelUsed,
    fuelAdded: round2(trips.reduce((s, t) => s + t.fuelAdded, 0)),
    averageKmPerLiter: achievedKmPerLiter(distance, fuelUsed),
  };
}

/** Years that have trip records, newest first (for report pickers). */
export function tripYears(trips: FuelTrip[]): number[] {
  const years = new Set(trips.map((t) => new Date(t.tripDate).getFullYear()));
  return [...years].sort((a, b) => b - a);
}
