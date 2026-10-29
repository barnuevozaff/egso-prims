import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/offices/api.supabase";

/**
 * The office directory: the one list every Office / Department field offers
 * (29 Oct 2026). Which database answers is decided once, in
 * lib/data-backend.ts; the Firestore version loads on first use.
 */

type Api = typeof supabaseApi;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/offices/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/offices/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type { Office } from "@/features/offices/api.supabase";

export const listOffices = pick("listOffices");
export const addOffice = pick("addOffice");
export const renameOffice = pick("renameOffice");
export const removeOffice = pick("removeOffice");
