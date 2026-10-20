import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/reservations/api.supabase";

/**
 * Reservation service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = Omit<typeof supabaseApi, "rowToRes">;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/reservations/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/reservations/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type { ReservationDraftInput } from "@/features/reservations/api.supabase";

export const listReservations = pick("listReservations");
export const getReservation = pick("getReservation");
export const listBookingsBetween = pick("listBookingsBetween");
export const findConflicts = pick("findConflicts");
export const createReservation = pick("createReservation");
export const updateReservation = pick("updateReservation");
export const deleteReservations = pick("deleteReservations");
export const setReservationStatus = pick("setReservationStatus");
export const cancelReservation = pick("cancelReservation");
export const addReservationComment = pick("addReservationComment");
export const removeReservationAttachment = pick("removeReservationAttachment");

// The same for both databases.
export const exportReservationsCsv = supabaseApi.exportReservationsCsv;
