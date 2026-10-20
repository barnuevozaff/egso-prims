import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/records/shelf-api.supabase";

/**
 * Records Room service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (shelf-api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToLevel" | "rowToBox">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/records/shelf-api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/records/shelf-api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export const listShelves = pick("listShelves");
export const listBoxes = pick("listBoxes");
export const listContents = pick("listContents");
export const findFiledBox = pick("findFiledBox");
export const createShelf = pick("createShelf");
export const updateShelf = pick("updateShelf");
export const deleteShelf = pick("deleteShelf");
export const moveBox = pick("moveBox");
export const relabelBox = pick("relabelBox");
