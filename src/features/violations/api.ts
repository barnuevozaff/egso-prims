import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/violations/api.supabase";

/**
 * Violation Management service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToViolator" | "rowToViolation">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/violations/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/violations/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type {
  ViolatorInput,
  RecordViolationInput,
  ViolationInput,
  PaymentInput,
} from "@/features/violations/api.supabase";

export const listViolators = pick("listViolators");
export const getViolator = pick("getViolator");
export const createViolator = pick("createViolator");
export const updateViolator = pick("updateViolator");
export const deleteViolators = pick("deleteViolators");
export const archiveViolator = pick("archiveViolator");
export const findViolatorByName = pick("findViolatorByName");
export const recordViolation = pick("recordViolation");
export const listViolations = pick("listViolations");
export const createViolation = pick("createViolation");
export const updateViolation = pick("updateViolation");
export const getViolation = pick("getViolation");
export const recordPayment = pick("recordPayment");
export const cancelViolation = pick("cancelViolation");
export const deleteViolations = pick("deleteViolations");

// The same for both databases.
export const exportViolatorsCsv = supabaseApi.exportViolatorsCsv;
export const exportViolationsCsv = supabaseApi.exportViolationsCsv;
