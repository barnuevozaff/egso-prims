import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/inventory/api.supabase";

/**
 * Inventory service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToItem" | "rowToEntry">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/inventory/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/inventory/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type { ItemDraftInput, StockDeduction } from "@/features/inventory/api.supabase";

export const listInventoryItems = pick("listInventoryItems");
export const getInventoryItem = pick("getInventoryItem");
export const nextItemCode = pick("nextItemCode");
export const createInventoryItem = pick("createInventoryItem");
export const updateInventoryItem = pick("updateInventoryItem");
export const deleteInventoryItems = pick("deleteInventoryItems");
export const addInventoryComment = pick("addInventoryComment");
export const removeInventoryAttachment = pick("removeInventoryAttachment");
export const deductStock = pick("deductStock");
export const adjustStock = pick("adjustStock");
export const listStockCard = pick("listStockCard");

// The same for both databases.
export const stockThresholds = supabaseApi.stockThresholds;
export const itemCodePrefix = supabaseApi.itemCodePrefix;
export const exportInventoryCsv = supabaseApi.exportInventoryCsv;
