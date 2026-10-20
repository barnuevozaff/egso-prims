import {
  byFields,
  callFunction,
  claimKey,
  getRow,
  listWhere,
  matchesSearch,
  saveClaimedRow,
  updateRow,
  type Row,
} from "@/lib/firestore";
import {
  rowToOdometer,
  rowToTransaction,
  rowToTrip,
  rowToVehicle,
  type OdometerReadingDraftInput,
  type OdometerReadingFilters,
  type TransactionDraftInput,
  type TripDraftInput,
  type VehicleDraftInput,
  type VehicleListFilters,
} from "@/features/fuel/api.supabase";
import { deleteHolders } from "@/features/shared/record-holders";
import type {
  FuelOdometerReading,
  FuelTransaction,
  FuelTransactionFilters,
  FuelTrip,
  FuelTripFilters,
  FuelVehicle,
} from "@/features/fuel/types";

/**
 * Fuel Consumption service — Firestore-backed. Same signatures as
 * api.supabase.ts. Fuel transactions are numbered (FC) by the
 * createNumberedRecord Cloud Function and trips get their monthly control
 * number from createFuelTrip, each in one transaction. The columns Postgres
 * generated (a trip's distance and fuel, a transaction's total, a reading's
 * distance) are computed on every save here and in those functions.
 */

const VEHICLES = "fuel_vehicles";
const TRIPS = "fuel_trips";
const TRANSACTIONS = "fuel_transactions";
const ODOMETER = "fuel_odometer_readings";
const nowIso = () => new Date().toISOString();

/* ---------------- vehicles ---------------- */

export async function listFuelVehicles(filters: VehicleListFilters = {}): Promise<FuelVehicle[]> {
  const rows = await listWhere(
    VEHICLES,
    { office_code: filters.officeCode, fuel_type: filters.fuelType, status: filters.status },
    byFields("plate_number"),
  );
  return rows
    .filter((r) => matchesSearch(r, ["vehicle_name", "plate_number", "vehicle_type", "fuel_type"], filters.search))
    .map(rowToVehicle);
}

export async function getFuelVehicle(id: string): Promise<FuelVehicle | null> {
  const row = await getRow(VEHICLES, id);
  return row ? rowToVehicle(row) : null;
}

const vehicleFields = (input: VehicleDraftInput) => ({
  vehicle_name: input.vehicleName,
  plate_number: input.plateNumber,
  vehicle_type: input.vehicleType,
  office_code: input.officeCode,
  fuel_type: input.fuelType,
  tank_capacity: input.tankCapacity,
  km_per_liter: input.kmPerLiter,
  current_fuel_balance: input.currentFuelBalance,
  status: input.status,
});

const DUPLICATE_PLATE = "A vehicle with that plate number is already registered.";

/** Plate numbers are unique, held by a claim (unique_keys) saved with the vehicle. */
const plateKey = (r: Record<string, unknown>) => claimKey(VEHICLES, "plate_number", String(r.plate_number ?? ""));

export async function createFuelVehicle(input: VehicleDraftInput): Promise<FuelVehicle> {
  const at = nowIso();
  return rowToVehicle(
    await saveClaimedRow({
      collection: VEHICLES,
      id: `fv-${Date.now()}`,
      isNew: true,
      fields: { ...vehicleFields(input), created_at: at, updated_at: at },
      keyOf: plateKey,
      duplicate: DUPLICATE_PLATE,
      notFound: "",
    }),
  );
}

export async function updateFuelVehicle(id: string, input: VehicleDraftInput): Promise<FuelVehicle> {
  return rowToVehicle(
    await saveClaimedRow({
      collection: VEHICLES,
      id,
      isNew: false,
      fields: { ...vehicleFields(input), updated_at: nowIso() },
      keyOf: plateKey,
      duplicate: DUPLICATE_PLATE,
      notFound: `Vehicle not found: ${id}`,
    }),
  );
}

/**
 * Deletes vehicles that hold no records; a vehicle with trips, purchases or
 * readings is kept (official records are never deleted) — set it Inactive.
 */
export async function deleteFuelVehicles(ids: string[]): Promise<void> {
  await deleteHolders(VEHICLES, ids);
}

/* ---------------- trips ---------------- */

export async function listFuelTrips(filters: FuelTripFilters = {}): Promise<FuelTrip[]> {
  const rows = await listWhere(
    TRIPS,
    { vehicle_id: filters.vehicleId, status: filters.status },
    byFields("-trip_date", "-control_no"),
  );
  return rows
    .filter((r) => !filters.dateFrom || String(r.trip_date) >= filters.dateFrom)
    .filter((r) => !filters.dateTo || String(r.trip_date) <= filters.dateTo)
    .filter((r) =>
      matchesSearch(r, ["control_no", "purpose", "origin", "destination", "driver", "passengers"], filters.search),
    )
    .map(rowToTrip)
    .filter((t) => filters.includeVoided || !t.voided)
    .filter((t) => {
      const d = new Date(t.tripDate);
      if (filters.year && d.getFullYear() !== filters.year) return false;
      if (filters.month && d.getMonth() + 1 !== filters.month) return false;
      return true;
    });
}

/** Same column mapping as api.supabase.ts. */
function tripRow(input: TripDraftInput) {
  return {
    vehicle_id: input.vehicleId,
    trip_date: input.tripDate,
    purpose: input.purpose?.trim() || null,
    origin: input.origin?.trim() || null,
    destination: input.destination?.trim() || null,
    driver: input.driver?.trim() || null,
    passengers: input.passengers?.trim() || null,
    no_of_trips: input.noOfTrips,
    source: input.source ?? "Manual",
    beginning_odometer: input.beginningOdometer,
    ending_odometer: input.endingOdometer,
    km_per_liter: input.kmPerLiter,
    beginning_fuel: input.beginningFuel,
    fuel_added: input.fuelAdded,
    status: input.status ?? "Completed",
    remarks: input.remarks?.trim() || null,
  };
}

const ODOMETER_BACKWARDS = "Odometer IN cannot be lower than Odometer OUT.";

/**
 * Records a trip under its month's next control number and carries the
 * computed ending balance back onto the vehicle, so the next trip starts
 * from the right amount of fuel.
 */
export async function createFuelTrip(input: TripDraftInput): Promise<FuelTrip> {
  if (input.endingOdometer < input.beginningOdometer) throw new Error(ODOMETER_BACKWARDS);
  const trip = rowToTrip(await callFunction<Row>("createFuelTrip", { record: tripRow(input) }));
  await syncVehicleBalance(trip.vehicleId);
  return trip;
}

/**
 * Trips and purchases are finalized records (policy 2026-10-20): corrected
 * with a reason, or voided — never edited in place or deleted.
 */
export async function updateFuelTrip(_id: string, _input: TripDraftInput): Promise<FuelTrip> {
  throw new Error("Trips are corrected with a reason, or voided, not edited or deleted directly.");
}

export async function deleteFuelTrips(_ids: string[]): Promise<void> {
  throw new Error("Trips are corrected with a reason, or voided, not edited or deleted directly.");
}

/** Corrects a trip, keeping the previous values in its revisions; the vehicle's balance follows. */
export async function correctFuelTrip(id: string, input: TripDraftInput, reason: string): Promise<FuelTrip> {
  if (input.endingOdometer < input.beginningOdometer) throw new Error(ODOMETER_BACKWARDS);
  const current = await getRow(TRIPS, id);
  const month = String(current?.control_no ?? "").slice(0, 7);
  if (month && input.tripDate.slice(0, 7) !== month) {
    throw new Error(
      `Trip ${String(current?.control_no)} belongs to ${month}; its date must stay in that month. Void it and record the trip again in the right month.`,
    );
  }
  const { vehicle_id: _vehicle, ...changes } = tripRow(input);
  const trip = rowToTrip(await callFunction<Row>("correctUtilityRecord", { type: "TRIP", id, changes, reason }));
  await syncVehicleBalance(trip.vehicleId);
  return trip;
}

/** Voids a trip: it stays on file, out of totals, and no longer sets the vehicle's balance. */
export async function voidFuelTrip(id: string, reason: string): Promise<FuelTrip> {
  const trip = rowToTrip(await callFunction<Row>("voidUtilityRecord", { type: "TRIP", id, reason }));
  await syncVehicleBalance(trip.vehicleId);
  return trip;
}

/**
 * Re-points a vehicle's running balance at its latest trip, as the Supabase
 * version does. With no trips left the configured balance stands.
 */
async function syncVehicleBalance(vehicleId: string): Promise<void> {
  const [latest] = (await listWhere(TRIPS, { vehicle_id: vehicleId }, byFields("-trip_date", "-created_at"))).filter(
    (t) => t.voided !== true,
  );
  if (!latest) return;
  const balance = Math.max(Number(latest.ending_fuel ?? 0), 0);
  await updateRow(VEHICLES, vehicleId, `Vehicle not found: ${vehicleId}`, () => ({
    current_fuel_balance: Math.round(balance * 100) / 100,
    updated_at: nowIso(),
  }));
}

/* ---------------- transactions ---------------- */

export async function listFuelTransactions(filters: FuelTransactionFilters = {}): Promise<FuelTransaction[]> {
  const rows = await listWhere(TRANSACTIONS, { vehicle_id: filters.vehicleId }, byFields("-txn_date"));
  return rows
    .filter((r) => !filters.dateFrom || String(r.txn_date) >= filters.dateFrom)
    .filter((r) => !filters.dateTo || String(r.txn_date) <= filters.dateTo)
    .map(rowToTransaction)
    .filter((t) => filters.includeVoided || !t.voided)
    .filter((t) => {
      const d = new Date(t.txnDate);
      if (filters.year && d.getFullYear() !== filters.year) return false;
      if (filters.month && d.getMonth() + 1 !== filters.month) return false;
      return true;
    });
}

export async function createFuelTransaction(input: TransactionDraftInput): Promise<FuelTransaction> {
  const row = await callFunction<Row>("createNumberedRecord", {
    type: "FC",
    record: {
      vehicle_id: input.vehicleId,
      txn_date: input.txnDate,
      fuel_type: input.fuelType,
      liters: input.liters,
      price_per_liter: input.pricePerLiter,
      driver: input.driver?.trim() || null,
      odometer: input.odometer ?? null,
      remarks: input.remarks?.trim() || null,
    },
  });
  return rowToTransaction(row);
}

export async function updateFuelTransaction(
  _id: string,
  _input: Omit<TransactionDraftInput, "vehicleId">,
): Promise<FuelTransaction> {
  throw new Error("Fuel purchases are corrected with a reason, or voided, not edited or deleted directly.");
}

export async function deleteFuelTransactions(_ids: string[]): Promise<void> {
  throw new Error("Fuel purchases are corrected with a reason, or voided, not edited or deleted directly.");
}

/** Corrects a purchase, keeping the previous values (total included) in its revisions. */
export async function correctFuelTransaction(
  id: string,
  input: Omit<TransactionDraftInput, "vehicleId">,
  reason: string,
): Promise<FuelTransaction> {
  return rowToTransaction(
    await callFunction<Row>("correctUtilityRecord", {
      type: "FC",
      id,
      changes: {
        txn_date: input.txnDate,
        fuel_type: input.fuelType,
        liters: input.liters,
        price_per_liter: input.pricePerLiter,
        driver: input.driver?.trim() || null,
        odometer: input.odometer ?? null,
        remarks: input.remarks?.trim() || null,
      },
      reason,
    }),
  );
}

/** Voids a purchase: it stays on file and out of totals. */
export async function voidFuelTransaction(id: string, reason: string): Promise<FuelTransaction> {
  return rowToTransaction(await callFunction<Row>("voidUtilityRecord", { type: "FC", id, reason }));
}

/* ---------------- odometer readings ---------------- */

/** Readings newest first, so the first row is always the latest. */
export async function listFuelOdometerReadings(filters: OdometerReadingFilters = {}): Promise<FuelOdometerReading[]> {
  return (await listWhere(ODOMETER, { vehicle_id: filters.vehicleId }, byFields("-reading_date", "-created_at")))
    .map(rowToOdometer)
    .filter((r) => filters.includeVoided || !r.voided);
}

/** The reading's columns, with distance computed as Postgres generated it. */
function odometerFields(input: Omit<OdometerReadingDraftInput, "vehicleId">) {
  if (input.currentOdometer < input.previousOdometer) {
    throw new Error("The current odometer cannot be lower than the previous reading.");
  }
  return {
    reading_date: input.readingDate,
    previous_odometer: input.previousOdometer,
    current_odometer: input.currentOdometer,
    distance: input.currentOdometer - input.previousOdometer,
    fuel_cost: input.fuelCost,
    fuel_liters: input.fuelLiters,
    remarks: input.remarks?.trim() || null,
  };
}

/** Saved by the server (createUtilityEntry): none for an inactive vehicle. */
export async function createFuelOdometerReading(input: OdometerReadingDraftInput): Promise<FuelOdometerReading> {
  const { distance: _derived, ...fields } = odometerFields(input);
  return rowToOdometer(
    await callFunction<Row>("createUtilityEntry", { type: "ODO", record: { vehicle_id: input.vehicleId, ...fields } }),
  );
}

/** Readings keep their correction history (2026-10-21): use correctFuelOdometerReading. */
export async function updateFuelOdometerReading(
  _id: string,
  _input: Omit<OdometerReadingDraftInput, "vehicleId">,
): Promise<FuelOdometerReading> {
  throw new Error("Odometer readings are corrected with a reason; their previous values are kept.");
}

/** Corrects a reading, keeping the previous values (distance included) in its revisions. */
export async function correctFuelOdometerReading(
  id: string,
  input: Omit<OdometerReadingDraftInput, "vehicleId">,
  reason: string,
): Promise<FuelOdometerReading> {
  const { distance: _derived, ...changes } = odometerFields(input);
  return rowToOdometer(await callFunction<Row>("correctUtilityRecord", { type: "ODO", id, changes, reason }));
}

/** Readings are voided, not deleted (approved 2026-10-21). */
export async function deleteFuelOdometerReadings(_ids: string[]): Promise<void> {
  throw new Error("Odometer readings are voided with a reason, not deleted; the record and its history are kept.");
}

/** Voids a reading: it stays on file and out of totals. */
export async function voidFuelOdometerReading(id: string, reason: string): Promise<FuelOdometerReading> {
  return rowToOdometer(await callFunction<Row>("voidUtilityRecord", { type: "ODO", id, reason }));
}
