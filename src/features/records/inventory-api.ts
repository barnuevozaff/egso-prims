import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/records/inventory-api.supabase";

/**
 * Records Inventory and Appraisal service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (inventory-api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToAppraisal" | "rowToRecord" | "recordRows" | "validate" | "headerRow">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/records/inventory-api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/records/inventory-api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export const listAppraisals = pick("listAppraisals");
export const recordCounts = pick("recordCounts");
export const getAppraisal = pick("getAppraisal");
export const createAppraisal = pick("createAppraisal");
export const updateAppraisal = pick("updateAppraisal");
export const deleteAppraisal = pick("deleteAppraisal");
export const voidAppraisal = pick("voidAppraisal");
