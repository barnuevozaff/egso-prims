import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/config/api.supabase";

/**
 * System configuration service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToEntry">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/config/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/config/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type { ConfigFilters, SystemStatus } from "@/features/config/api.supabase";

export const listConfiguration = pick("listConfiguration");
export const getConfigValue = pick("getConfigValue");
export const setConfigValue = pick("setConfigValue");
export const setConfigValues = pick("setConfigValues");
export const getConfigString = pick("getConfigString");
export const getConfigNumber = pick("getConfigNumber");
export const getConfigBoolean = pick("getConfigBoolean");
export const getConfigObject = pick("getConfigObject");
export const getSystemStatus = pick("getSystemStatus");
export const getConfigCategory = pick("getConfigCategory");
