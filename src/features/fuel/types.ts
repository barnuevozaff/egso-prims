import type { FinalizedRecord } from "@/features/shared/revisions";

/** Fuel Consumption domain types. Shapes mirror the Supabase schema. */

export type VehicleStatus = "Active" | "Inactive";

export interface FuelVehicle {
  id: string;
  vehicleName: string;
  plateNumber: string;
  vehicleType: string;
  /** DEPARTMENTS code of the office the vehicle is assigned to. */
  officeCode: string;
  fuelType: string;
  /** Usable tank size in litres. */
  tankCapacity: number;
  /** Rated efficiency in kilometres per litre; drives every fuel-used figure. */
  kmPerLiter: number;
  /** Running balance in litres — the default starting fuel for the next trip. */
  currentFuelBalance: number;
  status: VehicleStatus;
  createdAt: string;
  updatedAt: string;
}

/* ---------------- trips ---------------- */

export type TripStatus = "Completed" | "Draft";

/** Where the row came from — hand-entered, or an approved trip ticket. */
export type TripSource = "Manual" | "Trip Ticket";

/**
 * One row of the Trip Summary sheet. Distance, fuel used, total and ending
 * balance are computed by the database from the base columns, so the figures
 * can never drift from what the form showed.
 */
export interface FuelTrip extends FinalizedRecord {
  id: string;
  /** Sheet control number, e.g. 2026-07-0021. */
  controlNo: string;
  vehicleId: string;
  /** ISO date the vehicle was used. */
  tripDate: string;
  purpose?: string;
  /** Itinerary origin (the sheet's FROM). */
  origin?: string;
  /** Itinerary destination (the sheet's TO). */
  destination?: string;
  driver?: string;
  passengers?: string;
  /** Trips covered by this row; a day can hold several. */
  noOfTrips: number;
  source: TripSource;

  /** Odometer OUT. */
  beginningOdometer: number;
  /** Odometer IN. */
  endingOdometer: number;
  /** Efficiency snapshotted from the vehicle when the trip was recorded. */
  kmPerLiter: number;
  /** Fuel in the tank before leaving. */
  beginningFuel: number;
  /** Fuel purchased during the trip. */
  fuelAdded: number;

  /** endingOdometer − beginningOdometer. */
  distanceTravelled: number;
  /** beginningFuel + fuelAdded. */
  fuelTotal: number;
  /** distanceTravelled ÷ kmPerLiter. */
  fuelUsed: number;
  /** beginningFuel + fuelAdded − fuelUsed. */
  endingFuel: number;

  status: TripStatus;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

/** Filters accepted by the trip list endpoint. */
export interface FuelTripFilters {
  /** Voided records are left out of lists and totals unless asked for (history views). */
  includeVoided?: boolean;
  search?: string;
  vehicleId?: string;
  officeCode?: string;
  status?: string;
  year?: number;
  month?: number;
  dateFrom?: string;
  dateTo?: string;
}

/** Rolled-up history for one vehicle. */
export interface VehicleTripHistory {
  totalTrips: number;
  totalDistance: number;
  totalFuelUsed: number;
  totalFuelAdded: number;
  /** Distance ÷ fuel used across every trip; null until there is usage. */
  averageKmPerLiter: number | null;
  /** Most recent trip, or null when the vehicle has none. */
  lastTrip: FuelTrip | null;
  /** Running balance carried by the vehicle record. */
  currentFuelBalance: number;
}

export const TRIP_STATUSES: TripStatus[] = ["Completed", "Draft"];

export interface FuelTransaction extends FinalizedRecord {
  id: string;
  /** Centrally generated document number, e.g. FC-2026-000001. */
  docNumber?: string;
  vehicleId: string;
  /** ISO date of the fill-up. */
  txnDate: string;
  fuelType: string;
  liters: number;
  pricePerLiter: number;
  /** Always liters × pricePerLiter; computed by the database. */
  totalAmount: number;
  driver?: string;
  odometer?: number;
  remarks?: string;
  createdAt: string;
}

/** One odometer reading for a vehicle. */
export interface FuelOdometerReading extends FinalizedRecord {
  id: string;
  vehicleId: string;
  /** ISO date the odometer was read. */
  readingDate: string;
  previousOdometer: number;
  currentOdometer: number;
  /** Always currentOdometer − previousOdometer; computed by the database. */
  distance: number;
  /** PHP spent on fuel for this leg. */
  fuelCost: number;
  fuelLiters: number;
  remarks?: string;
  createdAt: string;
}

export const VEHICLE_TYPES = [
  "Sedan",
  "SUV",
  "Pickup",
  "Van",
  "Truck",
  "Dump Truck",
  "Ambulance",
  "Motorcycle",
  "Heavy Equipment",
] as const;

export const FUEL_TYPES = ["Diesel", "Gasoline", "Premium Gasoline"] as const;

export const VEHICLE_STATUSES: VehicleStatus[] = ["Active", "Inactive"];

// Calendar + movement primitives are shared with the other utility modules.
import type { ComparisonStatus } from "@/features/shared/periods";

export { MONTHS, monthName, monthShort, periodLabel } from "@/features/shared/periods";
export type { ComparisonStatus };

/** One vehicle's month-over-month movement. */
export interface VehicleComparison {
  vehicle: FuelVehicle;
  /** Total spend for the selected period; null when nothing was recorded. */
  current: number | null;
  /** Total spend for the preceding month; null when unavailable. */
  previous: number | null;
  /** Litres drawn in the selected period. */
  currentLiters: number;
  /** Litres drawn in the preceding month. */
  previousLiters: number;
  /** current − previous, in PHP (0 when either side is missing). */
  difference: number;
  /** currentLiters − previousLiters. */
  litersDifference: number;
  /** Percentage change in spend; null when not computable. */
  percent: number | null;
  status: ComparisonStatus;
  /** Weighted average price per litre for the selected period. */
  avgPricePerLiter: number | null;
}

/** Combined movement across every registered vehicle. */
export interface OverallComparison {
  currentTotal: number;
  previousTotal: number;
  currentLiters: number;
  previousLiters: number;
  difference: number;
  litersDifference: number;
  percent: number | null;
  status: ComparisonStatus;
  increased: number;
  decreased: number;
  unchanged: number;
  vehicles: number;
}

/** Filters accepted by the transaction list endpoint. */
export interface FuelTransactionFilters {
  /** Voided records are left out of lists and totals unless asked for (history views). */
  includeVoided?: boolean;
  vehicleId?: string;
  year?: number;
  month?: number;
  /** Inclusive ISO date bounds, used by the report's date-range filter. */
  dateFrom?: string;
  dateTo?: string;
}
