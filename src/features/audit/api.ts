import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/audit/api.supabase";

/**
 * Audit service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToEntry">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/audit/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/audit/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export const listAuditEntries = pick("listAuditEntries");
export const getAuditEntry = pick("getAuditEntry");
export const listRelatedEntries = pick("listRelatedEntries");
export const listSessionEntries = pick("listSessionEntries");
export const addAuditComment = pick("addAuditComment");
export const deleteAuditEntries = pick("deleteAuditEntries");

// The same for both databases.
export const exportAuditCsv = supabaseApi.exportAuditCsv;
