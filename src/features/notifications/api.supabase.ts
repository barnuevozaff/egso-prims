import { requireDb, unwrap } from "@/lib/db";
import type { AppNotification, NotificationFilters } from "@/features/notifications/types";

/**
 * Notification Center service — Supabase-backed, same conventions as every
 * other General Services Office module. Components never call Supabase directly.
 *
 * Notifications are written by database triggers (see migration 012), not by
 * this file; `createNotification` exists only for the rare case where the
 * application needs to raise one itself.
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

/** Newest first; the drawer re-sorts unread to the top for display. */
export async function listNotifications(
  filters: NotificationFilters = {},
): Promise<AppNotification[]> {
  const db = requireDb();
  let q = db.from(TABLE).select("*").order("created_at", { ascending: false });
  if (filters.module) q = q.eq("module", filters.module);
  if (filters.unreadOnly) q = q.eq("is_read", false);
  // Deliberately capped rather than paged: the drawer shows a recent feed, and
  // 200 is already more than anyone scrolls. Every other list pages to
  // completion via fetchAll.
  q = q.limit(filters.limit ?? 200);
  return unwrap(await q).map(rowToNotification);
}

export async function markNotificationRead(id: string, isRead = true): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(TABLE).update({ is_read: isRead }).eq("id", id).select());
}

/** Marks every unread notification read, optionally within one module. */
export async function markAllNotificationsRead(module?: string): Promise<void> {
  const db = requireDb();
  let q = db.from(TABLE).update({ is_read: true }).eq("is_read", false);
  if (module) q = q.eq("module", module);
  unwrap(await q.select());
}

export interface NotificationDraftInput {
  title: string;
  description?: string;
  module: string;
  referenceId?: string;
  referenceType?: string;
  createdBy?: string;
}

/** Raises a notification from application code (triggers cover system events). */
export async function createNotification(
  input: NotificationDraftInput,
): Promise<AppNotification> {
  const db = requireDb();
  const row = {
    id: `NTF-APP-${Date.now()}`,
    title: input.title,
    description: input.description?.trim() || null,
    module: input.module,
    reference_id: input.referenceId ?? null,
    reference_type: input.referenceType ?? null,
    is_read: false,
    created_at: new Date().toISOString(),
    created_by: input.createdBy ?? null,
  };
  return rowToNotification(unwrap(await db.from(TABLE).insert(row).select().single()));
}

export async function deleteNotifications(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(TABLE).delete().in("id", ids));
}
