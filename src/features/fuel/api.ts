import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/fuel/api.supabase";

/**
 * Fuel Consumption service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToVehicle" | "rowToTrip" | "rowToTransaction" | "rowToOdometer">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/fuel/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/fuel/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type {
  VehicleListFilters,
  VehicleDraftInput,
  TripDraftInput,
  TransactionDraftInput,
  OdometerReadingFilters,
  OdometerReadingDraftInput,
} from "@/features/fuel/api.supabase";

export const listFuelVehicles = pick("listFuelVehicles");
export const getFuelVehicle = pick("getFuelVehicle");
export const createFuelVehicle = pick("createFuelVehicle");
export const updateFuelVehicle = pick("updateFuelVehicle");
export const deleteFuelVehicles = pick("deleteFuelVehicles");
export const correctFuelOdometerReading = pick("correctFuelOdometerReading");
export const listFuelTrips = pick("listFuelTrips");
export const createFuelTrip = pick("createFuelTrip");
export const updateFuelTrip = pick("updateFuelTrip");
export const deleteFuelTrips = pick("deleteFuelTrips");
export const listFuelTransactions = pick("listFuelTransactions");
export const createFuelTransaction = pick("createFuelTransaction");
export const updateFuelTransaction = pick("updateFuelTransaction");
export const deleteFuelTransactions = pick("deleteFuelTransactions");
export const correctFuelTrip = pick("correctFuelTrip");
export const voidFuelTrip = pick("voidFuelTrip");
export const correctFuelTransaction = pick("correctFuelTransaction");
export const voidFuelTransaction = pick("voidFuelTransaction");
export const listFuelOdometerReadings = pick("listFuelOdometerReadings");
export const createFuelOdometerReading = pick("createFuelOdometerReading");
export const updateFuelOdometerReading = pick("updateFuelOdometerReading");
export const deleteFuelOdometerReadings = pick("deleteFuelOdometerReadings");
export const voidFuelOdometerReading = pick("voidFuelOdometerReading");
