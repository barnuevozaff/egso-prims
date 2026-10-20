import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWrittenWithAuthContext } from "firebase-functions/v2/firestore";

import { buildNotification, writeNotification } from "./notifications.js";
import { manilaYear } from "./numbering.js";

/**
 * Audit trail — ported from the Postgres trigger function log_audit (latest
 * version in migration 047). One wildcard trigger replaces the 31 per-table
 * triggers; it ignores every collection not listed in AUDITED_MODULES, which
 * keeps audit_logs, notifications and document_counters from auditing
 * themselves.
 *
 * Records Management's own action names (Box Moved, Record Filed, …) are not
 * ported yet: that module's workflow is still being settled by its developer.
 * Its collections are audited with the generic Created / Updated / Deleted
 * actions until then.
 */

export const AUDITED_MODULES: Record<string, string> = {
  purchase_requests: "Purchase Requests",
  purchase_orders: "Purchase Orders",
  ris_requests: "RIS",
  inventory_items: "Inventory",
  reservations: "Reservations",
  energy_accounts: "Energy Consumption",
  energy_bills: "Energy Consumption",
  energy_submeters: "Energy Consumption",
  energy_submeter_bills: "Energy Consumption",
  water_accounts: "Water Consumption",
  water_bills: "Water Consumption",
  water_submeters: "Water Consumption",
  water_submeter_bills: "Water Consumption",
  water_meter_readings: "Water Consumption",
  fuel_vehicles: "Fuel Consumption",
  fuel_transactions: "Fuel Consumption",
  fuel_odometer_readings: "Fuel Consumption",
  fuel_trips: "Fuel Consumption",
  violators: "Violation Management",
  violations: "Violation Management",
  disposition_schedules: "Records Management",
  record_series: "Records Management",
  inventory_appraisals: "Records Management",
  inventory_records: "Records Management",
  disposal_requests: "Records Management",
  disposal_items: "Records Management",
  record_shelves: "Records Management",
  record_shelf_levels: "Records Management",
  record_boxes: "Records Management",
  record_box_contents: "Records Management",
};

/** The fields log_audit tried, in order, to name the record a clerk would recognise. */
const DOCUMENT_NUMBER_FIELDS = [
  "pr_number", "po_number", "ris_number", "res_number", "item_code", "account_number",
  "plate_number", "submeter_number", "control_no", "violation_no", "full_name",
  "schedule_no", "inventory_no", "request_no", "file_no",
  // A filed document (record_box_contents) is known by its own number.
  "document_no",
] as const;

type Row = Record<string, unknown> | undefined;

const text = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

function documentNumber(collection: string, row: Record<string, unknown>, id: string): string {
  for (const f of DOCUMENT_NUMBER_FIELDS) {
    const v = text(row[f]);
    if (v) return v;
  }
  if (collection === "record_series" && text(row.title_and_description)) {
    return String(row.title_and_description);
  }
  if (collection === "record_boxes" && row.document_type) {
    return `${row.document_type} ${row.year} Box ${String(row.sequence ?? "").padStart(2, "0")}`;
  }
  return text(row.id) ?? id;
}

/**
 * The action an entry names, as log_audit (migrations 040–047) named it: a
 * few changes have their own words; everything else is created, updated or
 * deleted.
 */
export function actionOf(collection: string, before: Row, after: Row): string {
  const was = (f: string) => text(before?.[f]) ?? "";
  const now = (f: string) => text(after?.[f]) ?? "";
  if (before && after) {
    if (collection === "violations" && was("payment_status") === "Pending" && now("payment_status") === "Paid") {
      return "Payment Recorded";
    }
    if (collection === "violations" && was("payment_status") !== "Cancelled" && now("payment_status") === "Cancelled") {
      return "Violation Cancelled";
    }
    if (collection === "disposal_requests" && was("status") === "Draft" && now("status") === "Submitted") {
      return "Disposal Requested";
    }
    if (collection === "disposal_requests" && was("status") !== "Approved" && now("status") === "Approved") {
      return "Disposal Authorised";
    }
    if (["disposition_schedules", "inventory_appraisals"].includes(collection)) {
      if (was("status") === "Draft" && now("status") === "Submitted") return "Schedule Submitted";
      if (was("status") !== "Approved" && now("status") === "Approved") return "Schedule Approved";
    }
    if (collection === "record_boxes" && (was("shelf_level_id") !== now("shelf_level_id") || was("slot") !== now("slot"))) {
      return "Box Moved";
    }
  }
  if (!before && collection === "record_boxes") return "Box Created";
  if (collection === "record_box_contents") {
    if (!before) return "Record Filed";
    if (!after) return "Record Unfiled";
  }
  return !before ? "Record Created" : !after ? "Record Deleted" : "Record Updated";
}

const statusOf = (row: Record<string, unknown>) =>
  text(row.status) ?? text(row.payment_status) ?? text(row.amount) ?? "—";

export interface AuditEntry {
  /** ISO 8601, as the Audit trail screen reads it and as Supabase returned it. */
  timestamp: string;
  user_name: string;
  user_role: string;
  department_code: string;
  module: string;
  action: string;
  document_number: string;
  previous_value: string | null;
  updated_value: string;
  response: string;
  severity: "Information" | "Warning" | "Critical";
  status: "Success";
  session_id: string;
}

/** Who a write is recorded under. */
export interface Actor {
  user: string;
  role: "Authenticated User" | "Public Portal" | "System";
}

export const PUBLIC_PORTAL: Actor = { user: "Public Portal", role: "Public Portal" };
export const SYSTEM: Actor = { user: "System", role: "System" };

/** The audit row for one write, or null when the collection is not audited. */
export function buildAuditEntry(args: {
  collection: string;
  docId: string;
  before: Row;
  after: Row;
  actor: Actor;
  now: Date;
}): AuditEntry | null {
  const { collection, docId, before, after, actor, now } = args;
  const module = AUDITED_MODULES[collection];
  const ref = after ?? before;
  if (!module || !ref) return null;

  const action = actionOf(collection, before, after);

  return {
    timestamp: now.toISOString(),
    user_name: actor.user,
    user_role: actor.role,
    department_code: "GSO",
    module,
    action,
    document_number: documentNumber(collection, ref, docId),
    previous_value: before ? `Status: ${statusOf(before)}` : null,
    updated_value: after ? `Status: ${statusOf(after)}` : "—",
    response: `${action} via GSO PRIMS`,
    severity: !after
      ? "Critical"
      : collection === "disposal_requests" && after.status === "Approved"
        ? "Warning"
        : "Information",
    status: "Success",
    session_id: "SES-DB",
  };
}

/** AUD-2026-0001: one running counter per Manila calendar year. */
async function nextAuditId(now: Date): Promise<string> {
  const db = getFirestore();
  const year = manilaYear(now);
  const counter = db.collection("document_counters").doc(`AUD-${year}`);
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counter);
    const next = Number(snap.get("current_sequence") ?? 0) + 1;
    tx.set(counter, { document_type: "AUD", year, current_sequence: next, updated_at: now });
    return next;
  });
  return `AUD-${year}-${String(seq).padStart(4, "0")}`;
}

const emailCache = new Map<string, string | null>();

async function emailOf(uid: string): Promise<string | null> {
  if (!emailCache.has(uid)) {
    const user = await getAuth().getUser(uid).catch(() => null);
    emailCache.set(uid, user?.email?.toLowerCase() ?? null);
  }
  return emailCache.get(uid) ?? null;
}

const staff = async (uid: string): Promise<Actor> => ({
  user: (await emailOf(uid)) ?? uid,
  role: "Authenticated User",
});

/**
 * Who made the write, from the stamp the write itself carries:
 * created_by_uid on a new record, updated_by_uid on a change. Browsers stamp
 * their own account and firestore.rules refuse any other; the create and
 * update functions stamp the account that called them. A portal submission
 * carries created_by_uid null. The trigger's own view of who wrote (auth
 * context) is used only when there is no stamp — a deletion, say — because
 * the emulator does not supply it; in production it does.
 */
export async function actorOf(
  authType: string,
  authId: string | undefined,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Promise<Actor> {
  if (!before && after) {
    if (typeof after.created_by_uid === "string") return staff(after.created_by_uid);
    if ("created_by_uid" in after && after.created_by_uid === null) return PUBLIC_PORTAL;
  }
  const stampedNow =
    before &&
    after &&
    typeof after.updated_by_uid === "string" &&
    (after.updated_by_uid !== before.updated_by_uid || after.updated_at !== before.updated_at);
  if (stampedNow) return staff(String(after.updated_by_uid));
  if (authType === "app_user" && authId) return staff(authId);
  if (authType === "unauthenticated") return PUBLIC_PORTAL;
  return SYSTEM;
}

/**
 * One trigger for every write in the database, replacing the 31 audit and
 * 12 notification triggers of the Postgres schema: it writes the audit entry
 * and, for the events notify_event covered, the notification. Collections
 * it does not know (audit_logs, notifications, counters…) are ignored, so it
 * never reacts to its own writes.
 */
export const recordEvents = onDocumentWrittenWithAuthContext("{collection}/{docId}", async (event) => {
  const { collection, docId } = event.params;
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const notification = buildNotification(collection, before, after);
  if (!AUDITED_MODULES[collection] && !notification) return;

  // When the write happened: the document's own commit time, to the
  // microsecond. The event's time can be coarser — the emulator rounds it to
  // the second — which dated entries before the write they record and left
  // entries in the same second in no particular order. A deletion leaves no
  // committed document, so it falls back to the event time.
  const now = event.data?.after.exists
    ? (event.data.after.updateTime?.toDate() ?? new Date(event.time))
    : new Date(event.time);
  const actor = await actorOf(event.authType, event.authId, before, after);

  const entry = buildAuditEntry({ collection, docId, before, after, actor, now });
  if (entry) {
    const id = await nextAuditId(now);
    await getFirestore().collection("audit_logs").doc(id).set({ id, ...entry });
  }
  if (notification) {
    await writeNotification(notification, docId, actor === PUBLIC_PORTAL || actor === SYSTEM ? null : actor.user, now);
  }
});
