import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/records/disposal-api.supabase";

/**
 * Request for Authority to Dispose of Records service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (disposal-api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToRequest" | "rowToItem" | "itemRows" | "validate" | "headerRow">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/records/disposal-api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/records/disposal-api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export const listRequests = pick("listRequests");
export const itemCounts = pick("itemCounts");
export const getRequest = pick("getRequest");
export const createRequest = pick("createRequest");
export const updateRequest = pick("updateRequest");
export const deleteRequest = pick("deleteRequest");
export const voidRequest = pick("voidRequest");
