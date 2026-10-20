/**
 * Which database each module reads and writes.
 *
 * Supabase stays the default. Setting VITE_DATA_BACKEND=firebase moves the
 * modules that have a Firestore implementation onto Firestore; every other
 * module keeps using Supabase until it is migrated too. Each migrated module
 * keeps its Supabase implementation in api.supabase.ts as the fallback.
 */

export type DataBackend = "supabase" | "firebase";

export const dataBackend: DataBackend =
  import.meta.env.VITE_DATA_BACKEND === "firebase" ? "firebase" : "supabase";

/** Tables whose module has a Firestore implementation. */
export const FIRESTORE_TABLES: ReadonlySet<string> = new Set([
  "purchase_requests",
  "purchase_orders",
  "ris_requests",
  "reservations",
  "inventory_items",
  "stock_card",
  "notifications",
  "audit_logs",
  "system_configuration",
  "energy_accounts",
  "energy_bills",
  "energy_submeters",
  "energy_submeter_bills",
  "water_accounts",
  "water_bills",
  "water_submeters",
  "water_submeter_bills",
  "water_meter_readings",
  "fuel_vehicles",
  "fuel_trips",
  "fuel_transactions",
  "fuel_odometer_readings",
  "violators",
  "violations",
  "disposition_schedules",
  "record_series",
  "inventory_appraisals",
  "inventory_records",
  "disposal_requests",
  "disposal_items",
  "record_shelves",
  "record_shelf_levels",
  "record_boxes",
  "record_box_contents",
]);

/** Whether this table is read and written through Firestore right now. */
export const usesFirestore = (table: string) =>
  dataBackend === "firebase" && FIRESTORE_TABLES.has(table);

/**
 * An async function of a module that is loaded on first call. Each module's
 * api.ts uses it for its Firestore implementation, so a Supabase build never
 * downloads the Firebase SDK and a Firebase build loads it only when a
 * screen first needs data.
 */
export function lazyCall<M, K extends keyof M>(load: () => Promise<M>, name: K): M[K] {
  const call = async (...args: unknown[]) => {
    const fn = (await load())[name] as unknown as (...a: unknown[]) => unknown;
    return fn(...args);
  };
  return call as unknown as M[K];
}
