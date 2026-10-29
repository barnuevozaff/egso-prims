import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/purchase-orders/api.supabase";

/**
 * Purchase Order service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToPO">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/purchase-orders/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/purchase-orders/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type { PODetailsInput, PODraftInput } from "@/features/purchase-orders/api.supabase";

export const listPurchaseOrders = pick("listPurchaseOrders");
export const getPurchaseOrder = pick("getPurchaseOrder");
export const createPurchaseOrder = pick("createPurchaseOrder");
export const updatePurchaseOrder = pick("updatePurchaseOrder");
export const deletePurchaseOrders = pick("deletePurchaseOrders");
export const setPurchaseOrderStatus = pick("setPurchaseOrderStatus");
export const cancelPurchaseOrder = pick("cancelPurchaseOrder");
export const issuePurchaseOrder = pick("issuePurchaseOrder");
export const acknowledgePurchaseOrder = pick("acknowledgePurchaseOrder");
export const addPurchaseOrderComment = pick("addPurchaseOrderComment");
export const removePurchaseOrderAttachment = pick("removePurchaseOrderAttachment");
export const updatePurchaseOrderDetails = pick("updatePurchaseOrderDetails");

// The same for both databases.
export const exportPurchaseOrdersCsv = supabaseApi.exportPurchaseOrdersCsv;
