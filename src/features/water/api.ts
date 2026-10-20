import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/water/api.supabase";

/**
 * Water Consumption service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToAccount" | "rowToBill" | "rowToSubmeter" | "rowToSubmeterBill" | "rowToReading">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/water/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/water/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type {
  AccountListFilters,
  AccountDraftInput,
  BillDraftInput,
  SubmeterListFilters,
  SubmeterDraftInput,
  SubmeterAssignmentInput,
  SubmeterBillFilters,
  SubmeterBillDraftInput,
  MeterReadingFilters,
  MeterReadingDraftInput,
} from "@/features/water/api.supabase";

export const listWaterAccounts = pick("listWaterAccounts");
export const getWaterAccount = pick("getWaterAccount");
export const createWaterAccount = pick("createWaterAccount");
export const updateWaterAccount = pick("updateWaterAccount");
export const deleteWaterAccounts = pick("deleteWaterAccounts");
export const archiveWaterAccount = pick("archiveWaterAccount");
export const correctWaterSubmeterBill = pick("correctWaterSubmeterBill");
export const correctWaterMeterReading = pick("correctWaterMeterReading");
export const listWaterBills = pick("listWaterBills");
export const createWaterBill = pick("createWaterBill");
export const updateWaterBill = pick("updateWaterBill");
export const deleteWaterBills = pick("deleteWaterBills");
export const correctWaterBill = pick("correctWaterBill");
export const voidWaterBill = pick("voidWaterBill");
export const listWaterSubmeters = pick("listWaterSubmeters");
export const createWaterSubmeter = pick("createWaterSubmeter");
export const updateWaterSubmeter = pick("updateWaterSubmeter");
export const assignWaterSubmeter = pick("assignWaterSubmeter");
export const archiveWaterSubmeter = pick("archiveWaterSubmeter");
export const deleteWaterSubmeters = pick("deleteWaterSubmeters");
export const listWaterSubmeterBills = pick("listWaterSubmeterBills");
export const createWaterSubmeterBill = pick("createWaterSubmeterBill");
export const updateWaterSubmeterBill = pick("updateWaterSubmeterBill");
export const deleteWaterSubmeterBills = pick("deleteWaterSubmeterBills");
export const voidWaterSubmeterBill = pick("voidWaterSubmeterBill");
export const listWaterMeterReadings = pick("listWaterMeterReadings");
export const createWaterMeterReading = pick("createWaterMeterReading");
export const updateWaterMeterReading = pick("updateWaterMeterReading");
export const deleteWaterMeterReadings = pick("deleteWaterMeterReadings");
export const voidWaterMeterReading = pick("voidWaterMeterReading");
