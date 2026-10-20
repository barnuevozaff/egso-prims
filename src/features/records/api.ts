import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/records/api.supabase";

/**
 * Records Disposition Schedule service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToSchedule" | "rowToSeries" | "seriesRows" | "validate">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/records/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/records/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export const listSchedules = pick("listSchedules");
export const seriesCounts = pick("seriesCounts");
export const getSchedule = pick("getSchedule");
export const createSchedule = pick("createSchedule");
export const updateSchedule = pick("updateSchedule");
export const deleteSchedule = pick("deleteSchedule");
export const voidSchedule = pick("voidSchedule");
