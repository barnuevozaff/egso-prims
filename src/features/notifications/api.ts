import { dataBackend, lazyCall } from "@/lib/data-backend";
import * as supabaseApi from "@/features/notifications/api.supabase";

/**
 * Notification Center service. Screens import from here; which database answers is decided
 * once, in lib/data-backend.ts. The Firestore version (api.firebase.ts) is
 * loaded only when the app runs on Firebase, and on first use, so a Supabase
 * build never downloads the Firebase SDK.
 */

type Api = typeof supabaseApi;

// Type-only check, nothing is bundled: the Firestore version must take and
// return exactly what the Supabase version does.
const firestoreMatches: Api = {} as typeof import("@/features/notifications/api.firebase");
void firestoreMatches;

const loadFirestore = () => import("@/features/notifications/api.firebase") as Promise<Api>;
const pick = <K extends keyof Api>(name: K): Api[K] =>
  dataBackend === "firebase" ? lazyCall(loadFirestore, name) : supabaseApi[name];

export type { NotificationDraftInput } from "@/features/notifications/api.supabase";

export const listNotifications = pick("listNotifications");
export const markNotificationRead = pick("markNotificationRead");
export const markAllNotificationsRead = pick("markAllNotificationsRead");
export const createNotification = pick("createNotification");
export const deleteNotifications = pick("deleteNotifications");
