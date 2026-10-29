import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/ris/api.supabase";

/**
 * RIS service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToRIS">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/ris/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/ris/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type { RISDraftInput, StockSuggestion } from "@/features/ris/api.supabase";

export const listRequests = pick("listRequests");
export const getRequest = pick("getRequest");
export const createRequest = pick("createRequest");
export const updateRequest = pick("updateRequest");
export const deleteRequests = pick("deleteRequests");
export const setRequestStatus = pick("setRequestStatus");
export const cancelRequest = pick("cancelRequest");
export const approveRequest = pick("approveRequest");
export const rejectRequest = pick("rejectRequest");
export const addRequestComment = pick("addRequestComment");
export const removeRequestAttachment = pick("removeRequestAttachment");
export const listStock = pick("listStock");

// The same for both databases.
export const exportRequestsCsv = supabaseApi.exportRequestsCsv;
