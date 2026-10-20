import { fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import { NEEDS_FIREBASE, rowToRevisions, rowToVoid } from "@/features/shared/revisions";
import type {
  FuelOdometerReading,
  FuelTransaction,
  FuelTransactionFilters,
  FuelTrip,
  FuelTripFilters,
  FuelVehicle,
  TripSource,
  TripStatus,
  VehicleStatus,
} from "@/features/fuel/types";

/**
 * Fuel Consumption service — Supabase-backed, same conventions as every
 * other General Services Office module. Components never call Supabase directly.
 */

const VEHICLES = "fuel_vehicles";
const TRIPS = "fuel_trips";
const TRANSACTIONS = "fuel_transactions";
const ODOMETER = "fuel_odometer_readings";
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToVehicle(r: any): FuelVehicle {
  return {
    id: r.id,
    vehicleName: r.vehicle_name,
    plateNumber: r.plate_number,
    vehicleType: r.vehicle_type,
    officeCode: r.office_code,
    fuelType: r.fuel_type,
    tankCapacity: Number(r.tank_capacity ?? 0),
    kmPerLiter: Number(r.km_per_liter ?? 0),
    currentFuelBalance: Number(r.current_fuel_balance ?? 0),
    status: r.status as VehicleStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToTrip(r: any): FuelTrip {
  return {
    id: r.id,
    controlNo: r.control_no,
    vehicleId: r.vehicle_id,
    tripDate: r.trip_date,
    purpose: r.purpose ?? undefined,
    origin: r.origin ?? undefined,
    destination: r.destination ?? undefined,
    driver: r.driver ?? undefined,
    passengers: r.passengers ?? undefined,
    noOfTrips: Number(r.no_of_trips ?? 1),
    source: (r.source ?? "Manual") as TripSource,
    beginningOdometer: Number(r.beginning_odometer ?? 0),
    endingOdometer: Number(r.ending_odometer ?? 0),
    kmPerLiter: Number(r.km_per_liter ?? 0),
    beginningFuel: Number(r.beginning_fuel ?? 0),
    fuelAdded: Number(r.fuel_added ?? 0),
    distanceTravelled: Number(r.distance_travelled ?? 0),
    fuelTotal: Number(r.fuel_total ?? 0),
    fuelUsed: Number(r.fuel_used ?? 0),
    endingFuel: Number(r.ending_fuel ?? 0),
    status: (r.status ?? "Completed") as TripStatus,
    remarks: r.remarks ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...rowToVoid(r),
    revisions: rowToRevisions(r),
  };
}

export function rowToTransaction(r: any): FuelTransaction {
  return {
    id: r.id,
    docNumber: r.doc_number ?? undefined,
    vehicleId: r.vehicle_id,
    txnDate: r.txn_date,
    fuelType: r.fuel_type,
    liters: Number(r.liters),
    pricePerLiter: Number(r.price_per_liter),
    totalAmount: Number(r.total_amount ?? 0),
    driver: r.driver ?? undefined,
    odometer: r.odometer === null || r.odometer === undefined ? undefined : Number(r.odometer),
    remarks: r.remarks ?? undefined,
    createdAt: r.created_at,
    ...rowToVoid(r),
    revisions: rowToRevisions(r),
  };
}

/* ---------------- vehicles ---------------- */

export interface VehicleListFilters {
  search?: string;
  officeCode?: string;
  fuelType?: string;
  status?: string;
}

export async function listFuelVehicles(
  filters: VehicleListFilters = {},
): Promise<FuelVehicle[]> {
  const db = requireDb();
  let q = db.from(VEHICLES).select("*").order("plate_number", { ascending: true });
  if (filters.officeCode) q = q.eq("office_code", filters.officeCode);
  if (filters.fuelType) q = q.eq("fuel_type", filters.fuelType);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.search?.trim()) {
    q = q.or(searchOr(["vehicle_name", "plate_number", "vehicle_type", "fuel_type"], filters.search));
  }
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToVehicle);
}

export async function getFuelVehicle(id: string): Promise<FuelVehicle | null> {
  const db = requireDb();
  const { data, error } = await db.from(VEHICLES).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToVehicle(data) : null;
}

export interface VehicleDraftInput {
  vehicleName: string;
  plateNumber: string;
  vehicleType: string;
  officeCode: string;
  fuelType: string;
  /** Usable tank size in litres. */
  tankCapacity: number;
  /** Rated kilometres per litre — drives every fuel-used computation. */
  kmPerLiter: number;
  /** Running balance in litres; the default starting fuel for the next trip. */
  currentFuelBalance: number;
  status: VehicleStatus;
}

export async function createFuelVehicle(input: VehicleDraftInput): Promise<FuelVehicle> {
  const db = requireDb();
  const at = nowIso();
  const row = {
    id: `fv-${Date.now()}`,
    vehicle_name: input.vehicleName,
    plate_number: input.plateNumber,
    vehicle_type: input.vehicleType,
    office_code: input.officeCode,
    fuel_type: input.fuelType,
    tank_capacity: input.tankCapacity,
    km_per_liter: input.kmPerLiter,
    current_fuel_balance: input.currentFuelBalance,
    status: input.status,
    created_at: at,
    updated_at: at,
  };
  const { data, error } = await db.from(VEHICLES).insert(row).select().single();
  if (error) {
    const msg = String((error as { message?: string }).message ?? "");
    if (msg.toLowerCase().includes("duplicate")) {
      throw new Error("A vehicle with that plate number is already registered.");
    }
    throw new Error(`Unable to register the vehicle: ${msg}`);
  }
  return rowToVehicle(data);
}

export async function updateFuelVehicle(
  id: string,
  input: VehicleDraftInput,
): Promise<FuelVehicle> {
  const db = requireDb();
  const row = {
    vehicle_name: input.vehicleName,
    plate_number: input.plateNumber,
    vehicle_type: input.vehicleType,
    office_code: input.officeCode,
    fuel_type: input.fuelType,
    tank_capacity: input.tankCapacity,
    km_per_liter: input.kmPerLiter,
    current_fuel_balance: input.currentFuelBalance,
    status: input.status,
    updated_at: nowIso(),
  };
  return rowToVehicle(unwrap(await db.from(VEHICLES).update(row).eq("id", id).select().single()));
}

/** Deletes vehicles; their transactions cascade in the database. */
export async function deleteFuelVehicles(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(VEHICLES).delete().in("id", ids));
}

/* ---------------- trips ---------------- */

/**
 * Next control number for the trip's month, e.g. 2026-07-0021. The sequence
 * restarts every month, matching the paper Trip Summary sheet.
 */
async function nextTripControlNo(tripDate: string): Promise<string> {
  const db = requireDb();
  const prefix = tripDate.slice(0, 7); // YYYY-MM
  const { data } = await db
    .from(TRIPS)
    .select("control_no")
    .like("control_no", `${prefix}-%`)
    .order("control_no", { ascending: false })
    .limit(1);
  const last = data?.[0]?.control_no as string | undefined;
  const seq = last ? Number(last.slice(prefix.length + 1)) || 0 : 0;
  return `${prefix}-${String(seq + 1).padStart(4, "0")}`;
}

export async function listFuelTrips(filters: FuelTripFilters = {}): Promise<FuelTrip[]> {
  const db = requireDb();
  let q = db
    .from(TRIPS)
    .select("*")
    .order("trip_date", { ascending: false })
    .order("control_no", { ascending: false });
  if (filters.vehicleId) q = q.eq("vehicle_id", filters.vehicleId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("trip_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("trip_date", filters.dateTo);
  if (filters.search?.trim()) {
    q = q.or(
      searchOr(["control_no", "purpose", "origin", "destination", "driver", "passengers"], filters.search),
    );
  }
  const rows = (await fetchAll((from, to) => q.range(from, to))).map(rowToTrip);

  // Month/year narrowing is applied in memory so callers can combine it
  // freely with the date-range bounds above.
  return rows.filter((t) => {
    const d = new Date(t.tripDate);
    if (filters.year && d.getFullYear() !== filters.year) return false;
    if (filters.month && d.getMonth() + 1 !== filters.month) return false;
    return true;
  });
}

export interface TripDraftInput {
  vehicleId: string;
  tripDate: string;
  purpose?: string;
  origin?: string;
  destination?: string;
  driver?: string;
  passengers?: string;
  noOfTrips: number;
  source?: TripSource;
  beginningOdometer: number;
  endingOdometer: number;
  /** Snapshotted from the vehicle so historical trips never re-compute. */
  kmPerLiter: number;
  beginningFuel: number;
  fuelAdded: number;
  status?: TripStatus;
  remarks?: string;
}

/** Shared column mapping. Distance, totals and ending fuel are generated. */
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

function tripError(error: unknown, fallback: string): Error {
  const msg = String((error as { message?: string }).message ?? "");
  if (msg.includes("fuel_trip_odometer_forward")) {
    return new Error("Odometer IN cannot be lower than Odometer OUT.");
  }
  if (msg.toLowerCase().includes("duplicate")) {
    return new Error("That control number is already in use. Please try again.");
  }
  return new Error(`${fallback}: ${msg}`);
}

/**
 * Records a trip and carries the computed ending balance back onto the
 * vehicle, so the next trip starts from the right amount of fuel.
 */
export async function createFuelTrip(input: TripDraftInput): Promise<FuelTrip> {
  const db = requireDb();
  const at = nowIso();
  const row = {
    id: `trp-${input.vehicleId}-${Date.now()}`,
    control_no: await nextTripControlNo(input.tripDate),
    ...tripRow(input),
    created_at: at,
    updated_at: at,
  };
  const { data, error } = await db.from(TRIPS).insert(row).select().single();
  if (error) throw tripError(error, "Unable to record the trip");
  const trip = rowToTrip(data);
  await syncVehicleBalance(trip.vehicleId);
  return trip;
}

export async function updateFuelTrip(id: string, input: TripDraftInput): Promise<FuelTrip> {
  const db = requireDb();
  const { data, error } = await db
    .from(TRIPS)
    .update({ ...tripRow(input), updated_at: nowIso() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw tripError(error, "Unable to update the trip");
  const trip = rowToTrip(data);
  await syncVehicleBalance(trip.vehicleId);
  return trip;
}

export async function deleteFuelTrips(ids: string[]): Promise<void> {
  const db = requireDb();
  const { data } = await db.from(TRIPS).select("vehicle_id").in("id", ids);
  const vehicleIds = [...new Set((data ?? []).map((r: any) => r.vehicle_id as string))];
  unwrap(await db.from(TRIPS).delete().in("id", ids));
  for (const vehicleId of vehicleIds) await syncVehicleBalance(vehicleId);
}

/**
 * Re-points a vehicle's running balance at its latest trip. Keeping this on the
 * vehicle means the trip form can open with the correct beginning fuel without
 * scanning history on every render.
 */
async function syncVehicleBalance(vehicleId: string): Promise<void> {
  const db = requireDb();
  const { data } = await db
    .from(TRIPS)
    .select("ending_fuel")
    .eq("vehicle_id", vehicleId)
    .order("trip_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  // With no trips left there is nothing to derive from, so the balance the
  // administrator configured on the vehicle stands.
  if (!data?.[0]) return;
  const balance = Math.max(Number(data[0].ending_fuel ?? 0), 0);
  await db
    .from(VEHICLES)
    .update({ current_fuel_balance: Math.round(balance * 100) / 100, updated_at: nowIso() })
    .eq("id", vehicleId);
}

/* ---------------- transactions ---------------- */

export async function listFuelTransactions(
  filters: FuelTransactionFilters = {},
): Promise<FuelTransaction[]> {
  const db = requireDb();
  let q = db.from(TRANSACTIONS).select("*").order("txn_date", { ascending: false });
  if (filters.vehicleId) q = q.eq("vehicle_id", filters.vehicleId);
  if (filters.dateFrom) q = q.gte("txn_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("txn_date", filters.dateTo);
  const rows = (await fetchAll((from, to) => q.range(from, to))).map(rowToTransaction);

  // Month/year narrowing is applied in memory so callers can combine it
  // freely with the date-range bounds above.
  return rows.filter((t) => {
    const d = new Date(t.txnDate);
    if (filters.year && d.getFullYear() !== filters.year) return false;
    if (filters.month && d.getMonth() + 1 !== filters.month) return false;
    return true;
  });
}

export interface TransactionDraftInput {
  vehicleId: string;
  txnDate: string;
  fuelType: string;
  liters: number;
  pricePerLiter: number;
  driver?: string;
  odometer?: number;
  remarks?: string;
}

export async function createFuelTransaction(
  input: TransactionDraftInput,
): Promise<FuelTransaction> {
  const db = requireDb();
  const docNumber = await nextDocumentNumber("FC");
  // total_amount is a generated column — the database computes it.
  const row = {
    doc_number: docNumber,
    id: `ft-${input.vehicleId}-${Date.now()}`,
    vehicle_id: input.vehicleId,
    txn_date: input.txnDate,
    fuel_type: input.fuelType,
    liters: input.liters,
    price_per_liter: input.pricePerLiter,
    driver: input.driver?.trim() || null,
    odometer: input.odometer ?? null,
    remarks: input.remarks?.trim() || null,
    created_at: nowIso(),
  };
  return rowToTransaction(unwrap(await db.from(TRANSACTIONS).insert(row).select().single()));
}

export async function updateFuelTransaction(
  id: string,
  input: Omit<TransactionDraftInput, "vehicleId">,
): Promise<FuelTransaction> {
  const db = requireDb();
  const row = {
    txn_date: input.txnDate,
    fuel_type: input.fuelType,
    liters: input.liters,
    price_per_liter: input.pricePerLiter,
    driver: input.driver?.trim() || null,
    odometer: input.odometer ?? null,
    remarks: input.remarks?.trim() || null,
  };
  return rowToTransaction(
    unwrap(await db.from(TRANSACTIONS).update(row).eq("id", id).select().single()),
  );
}

export async function deleteFuelTransactions(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(TRANSACTIONS).delete().in("id", ids));
}

/* ---------------- odometer readings ---------------- */

export function rowToOdometer(r: any): FuelOdometerReading {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    readingDate: r.reading_date,
    previousOdometer: Number(r.previous_odometer ?? 0),
    currentOdometer: Number(r.current_odometer ?? 0),
    distance: Number(r.distance ?? 0),
    fuelCost: Number(r.fuel_cost ?? 0),
    fuelLiters: Number(r.fuel_liters ?? 0),
    remarks: r.remarks ?? undefined,
    createdAt: r.created_at,
    ...rowToVoid(r),
    revisions: rowToRevisions(r),
  };
}

export interface OdometerReadingFilters {
  /** Voided entries stay on file; lists leave them out unless asked. */
  includeVoided?: boolean;
  vehicleId?: string;
}

/** Readings newest first, so the first row is always the latest. */
export async function listFuelOdometerReadings(
  filters: OdometerReadingFilters = {},
): Promise<FuelOdometerReading[]> {
  const db = requireDb();
  let q = db.from(ODOMETER).select("*").order("reading_date", { ascending: false });
  if (filters.vehicleId) q = q.eq("vehicle_id", filters.vehicleId);
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToOdometer);
}

export interface OdometerReadingDraftInput {
  vehicleId: string;
  readingDate: string;
  /** Carried forward from the latest reading; the form does not ask for it. */
  previousOdometer: number;
  currentOdometer: number;
  fuelCost: number;
  fuelLiters: number;
  remarks?: string;
}

/**
 * Records a reading. Distance is a generated column — the database derives it
 * from current − previous, so it is never sent from the client.
 */
export async function createFuelOdometerReading(
  input: OdometerReadingDraftInput,
): Promise<FuelOdometerReading> {
  const db = requireDb();
  const row = {
    id: `fod-${input.vehicleId}-${Date.now()}`,
    vehicle_id: input.vehicleId,
    reading_date: input.readingDate,
    previous_odometer: input.previousOdometer,
    current_odometer: input.currentOdometer,
    fuel_cost: input.fuelCost,
    fuel_liters: input.fuelLiters,
    remarks: input.remarks?.trim() || null,
    created_at: nowIso(),
  };
  const { data, error } = await db.from(ODOMETER).insert(row).select().single();
  if (error) {
    const msg = String((error as { message?: string }).message ?? "");
    if (msg.includes("fuel_odometer_not_backwards")) {
      throw new Error("The current odometer cannot be lower than the previous reading.");
    }
    throw new Error(`Unable to record the reading: ${msg}`);
  }
  return rowToOdometer(data);
}

export async function updateFuelOdometerReading(
  id: string,
  input: Omit<OdometerReadingDraftInput, "vehicleId">,
): Promise<FuelOdometerReading> {
  const db = requireDb();
  const row = {
    reading_date: input.readingDate,
    previous_odometer: input.previousOdometer,
    current_odometer: input.currentOdometer,
    fuel_cost: input.fuelCost,
    fuel_liters: input.fuelLiters,
    remarks: input.remarks?.trim() || null,
  };
  const { data, error } = await db.from(ODOMETER).update(row).eq("id", id).select().single();
  if (error) {
    const msg = String((error as { message?: string }).message ?? "");
    if (msg.includes("fuel_odometer_not_backwards")) {
      throw new Error("The current odometer cannot be lower than the previous reading.");
    }
    throw new Error(`Unable to update the reading: ${msg}`);
  }
  return rowToOdometer(data);
}

export async function deleteFuelOdometerReadings(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(ODOMETER).delete().in("id", ids));
}

/* ---------------- corrections and voids ---------------- */

/**
 * Corrections on Supabase change the values in place: there is no column for
 * the revision history the Firebase backend keeps. Voiding needs Firebase.
 */
export async function correctFuelTrip(id: string, input: TripDraftInput, _reason: string): Promise<FuelTrip> {
  return updateFuelTrip(id, input);
}

export async function voidFuelTrip(_id: string, _reason: string): Promise<FuelTrip> {
  throw new Error(NEEDS_FIREBASE);
}

export async function correctFuelTransaction(
  id: string,
  input: Omit<TransactionDraftInput, "vehicleId">,
  _reason: string,
): Promise<FuelTransaction> {
  return updateFuelTransaction(id, input);
}

export async function voidFuelTransaction(_id: string, _reason: string): Promise<FuelTransaction> {
  throw new Error(NEEDS_FIREBASE);
}

/** Corrects an odometer reading; on Supabase the values change in place (no history column). */
export async function correctFuelOdometerReading(
  id: string,
  input: Omit<OdometerReadingDraftInput, "vehicleId">,
  _reason: string,
): Promise<FuelOdometerReading> {
  return updateFuelOdometerReading(id, input);
}

/** Voiding needs the Firebase backend (approved 2026-10-21). */
export async function voidFuelOdometerReading(_id: string, _reason: string): Promise<FuelOdometerReading> {
  throw new Error(NEEDS_FIREBASE);
}
