import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/purchase-requests/api.supabase";

/**
 * Purchase Request service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToPR">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/purchase-requests/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/purchase-requests/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type { PRDraftInput } from "@/features/purchase-requests/api.supabase";

export const listPurchaseRequests = pick("listPurchaseRequests");
export const getPurchaseRequest = pick("getPurchaseRequest");
export const createPurchaseRequest = pick("createPurchaseRequest");
export const updatePurchaseRequest = pick("updatePurchaseRequest");
export const deletePurchaseRequests = pick("deletePurchaseRequests");
export const setPurchaseRequestStatus = pick("setPurchaseRequestStatus");
export const cancelPurchaseRequest = pick("cancelPurchaseRequest");
export const addPurchaseRequestComment = pick("addPurchaseRequestComment");
export const removePurchaseRequestAttachment = pick("removePurchaseRequestAttachment");
export const ensurePurchaseOrderForPR = pick("ensurePurchaseOrderForPR");

// The same for both databases.
export const VOIDABLE_PR_STATUSES = supabaseApi.VOIDABLE_PR_STATUSES;
export const exportPurchaseRequestsCsv = supabaseApi.exportPurchaseRequestsCsv;
