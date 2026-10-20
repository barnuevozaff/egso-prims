import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";

import { firestore, friendlyFirebaseError } from "@/lib/firestore";
import type { NotificationDraftInput } from "@/features/notifications/api.supabase";
import type { AppNotification, NotificationFilters } from "@/features/notifications/types";

/**
 * Notification Center service — Firestore-backed. Same signatures as
 * api.supabase.ts. Notifications are written by the recordEvents Cloud
 * Function, with notify_event's wording; browsers may only mark them read
 * (and Administrators clear them), as firestore.rules allow.
 */

const TABLE = "notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToNotification(r: any): AppNotification {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    module: r.module,
    referenceId: r.reference_id ?? undefined,
    referenceType: r.reference_type ?? undefined,
    isRead: !!r.is_read,
    createdAt: r.created_at,
    createdBy: r.created_by ?? undefined,
  };
}

function constraints(filters: { module?: string; unreadOnly?: boolean }): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (filters.module) c.push(where("module", "==", filters.module));
  if (filters.unreadOnly) c.push(where("is_read", "==", false));
  return c;
}

/** Newest first, capped (200 by default), as the drawer shows a recent feed. */
export async function listNotifications(filters: NotificationFilters = {}): Promise<AppNotification[]> {
  try {
    const snap = await getDocs(
      query(
        collection(firestore(), TABLE),
        ...constraints(filters),
        orderBy("created_at", "desc"),
        limit(filters.limit ?? 200),
      ),
    );
    return snap.docs.map((d) => rowToNotification({ ...d.data(), id: d.id }));
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

export async function markNotificationRead(id: string, isRead = true): Promise<void> {
  try {
    await updateDoc(doc(firestore(), TABLE, id), { is_read: isRead });
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

/** Marks every unread notification read, optionally within one module. */
export async function markAllNotificationsRead(module?: string): Promise<void> {
  try {
    const unread = await getDocs(query(collection(firestore(), TABLE), ...constraints({ module, unreadOnly: true })));
    for (let i = 0; i < unread.docs.length; i += 400) {
      const batch = writeBatch(firestore());
      for (const d of unread.docs.slice(i, i + 400)) batch.update(d.ref, { is_read: true });
      await batch.commit();
    }
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

/**
 * Raising a notification from the browser is not allowed on Firestore: the
 * system raises them (functions/src/notifications.ts). No screen calls this.
 */
export async function createNotification(input: NotificationDraftInput): Promise<AppNotification> {
  throw new Error(`Notifications are raised by the system, not by the browser ("${input.title}").`);
}

export async function deleteNotifications(ids: string[]): Promise<void> {
  try {
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(firestore());
      for (const id of ids.slice(i, i + 400)) batch.delete(doc(firestore(), TABLE, id));
      await batch.commit();
    }
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}
