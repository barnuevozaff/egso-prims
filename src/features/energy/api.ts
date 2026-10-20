import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/energy/api.supabase";

/**
 * Energy Consumption service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToAccount" | "rowToBill" | "rowToSubmeter" | "rowToSubmeterBill">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/energy/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/energy/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type {
  AccountListFilters,
  AccountDraftInput,
  BillDraftInput,
  SubmeterListFilters,
  SubmeterDraftInput,
  SubmeterBillFilters,
  SubmeterBillDraftInput,
} from "@/features/energy/api.supabase";

export const listEnergyAccounts = pick("listEnergyAccounts");
export const getEnergyAccount = pick("getEnergyAccount");
export const createEnergyAccount = pick("createEnergyAccount");
export const updateEnergyAccount = pick("updateEnergyAccount");
export const deleteEnergyAccounts = pick("deleteEnergyAccounts");
export const archiveEnergyAccount = pick("archiveEnergyAccount");
export const correctEnergySubmeterBill = pick("correctEnergySubmeterBill");
export const listEnergyBills = pick("listEnergyBills");
export const createEnergyBill = pick("createEnergyBill");
export const updateEnergyBill = pick("updateEnergyBill");
export const deleteEnergyBills = pick("deleteEnergyBills");
export const correctEnergyBill = pick("correctEnergyBill");
export const voidEnergyBill = pick("voidEnergyBill");
export const listEnergySubmeters = pick("listEnergySubmeters");
export const createEnergySubmeter = pick("createEnergySubmeter");
export const updateEnergySubmeter = pick("updateEnergySubmeter");
export const archiveEnergySubmeter = pick("archiveEnergySubmeter");
export const deleteEnergySubmeters = pick("deleteEnergySubmeters");
export const listEnergySubmeterBills = pick("listEnergySubmeterBills");
export const createEnergySubmeterBill = pick("createEnergySubmeterBill");
export const updateEnergySubmeterBill = pick("updateEnergySubmeterBill");
export const deleteEnergySubmeterBills = pick("deleteEnergySubmeterBills");
export const voidEnergySubmeterBill = pick("voidEnergySubmeterBill");
