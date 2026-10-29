import { getFirestore } from "firebase-admin/firestore";

import { manilaYear } from "./numbering.js";

/**
 * Notifications — ported from the Postgres trigger function notify_event
 * (migration 012). Same events, same titles and wording, same modules and
 * reference types, so the notification drawer shows exactly what it showed.
 * Called by the record trigger in audit.ts, which already fires on every
 * write; this decides whether the write is worth a notification.
 */

type Row = Record<string, unknown> | undefined;

export interface NotificationDraft {
  title: string;
  description: string;
  module: string;
  reference_type: string;
}

const s = (v: unknown, fallback = "") => (v === undefined || v === null ? fallback : String(v));

/** "Bond paper, A4 and 2 more items": what a request holds, for a summary line. */
function prFirstItem(ref: Row): string {
  const items = Array.isArray(ref?.items) ? (ref.items as { description?: unknown }[]) : [];
  const first = typeof items[0]?.description === "string" ? items[0].description.trim() : "";
  if (!first) return "";
  const more = items.length - 1;
  return more > 0 ? `${first} and ${more} more item${more === 1 ? "" : "s"}` : first;
}
const changedTo = (before: Row, after: Row, status: string) =>
  !!before && !!after && before.status !== after.status && after.status === status;

/** The notification a write raises, or null. */
export function buildNotification(collection: string, before: Row, after: Row): NotificationDraft | null {
  const created = !before && !!after;
  const deleted = !!before && !after;
  const ref = after ?? before ?? {};
  const make = (module: string, reference_type: string, title: string, description: string) => ({
    module,
    reference_type,
    title,
    description,
  });

  switch (collection) {
    case "purchase_requests":
      if (created) {
        // A public request may arrive without a purpose (21 Oct 2026); its
        // first item says what it is, without inventing a purpose.
        return make("Procurement", "purchase-request", "New Purchase Request Submitted",
          `${s(ref.pr_number)} — ${s(ref.purpose) || prFirstItem(ref) || "No purpose stated"}`);
      }
      if (changedTo(before, after, "Approved")) {
        return make(
          "Procurement",
          "purchase-request",
          "Purchase Request Approved",
          ref.official_pr_number
            ? `${s(ref.pr_number)} was approved as official PR No. ${s(ref.official_pr_number)}.`
            : `${s(ref.pr_number)} was approved.`,
        );
      }
      if (changedTo(before, after, "Rejected")) {
        return make("Procurement", "purchase-request", "Purchase Request Rejected", `${s(ref.pr_number)} was rejected.`);
      }
      return null;

    case "purchase_orders":
      if (created) {
        return make("Procurement", "purchase-order", "Purchase Order Created",
          `${s(ref.po_number)} created from ${s(ref.pr_number, "—")}`);
      }
      if (changedTo(before, after, "Approved")) {
        return make("Procurement", "purchase-order", "Purchase Order Approved", `${s(ref.po_number)} was approved.`);
      }
      return null;

    case "ris_requests":
      if (changedTo(before, after, "Released")) {
        return make("Procurement", "ris", "RIS Released", `${s(ref.ris_number)} has been released.`);
      }
      return null;

    case "inventory_items": {
      const onHand = Number(after?.on_hand);
      const reorder = Number(after?.reorder_level);
      if (
        before &&
        after &&
        onHand <= reorder &&
        Number(before.on_hand) > Number(before.reorder_level)
      ) {
        return make("Inventory", "inventory", "Low Stock Alert",
          `${s(ref.name)} fell to ${s(after.on_hand)} ${s(ref.unit, "units")} (reorder at ${s(after.reorder_level)}).`);
      }
      if (deleted) {
        return make("Inventory", "inventory", "Inventory Item Removed", `${s(ref.item_code)} — ${s(ref.name)} was removed.`);
      }
      return null;
    }

    case "reservations":
      if (created) {
        return make("Facilities", "reservation", "Facility Reservation Submitted",
          `${s(ref.res_number)} — ${s(ref.purpose, "No purpose stated")}`);
      }
      if (changedTo(before, after, "Approved")) {
        return make("Facilities", "reservation", "Facility Reservation Approved", `${s(ref.res_number)} was approved.`);
      }
      if (changedTo(before, after, "Rejected")) {
        return make("Facilities", "reservation", "Facility Reservation Rejected", `${s(ref.res_number)} was rejected.`);
      }
      return null;

    case "energy_bills":
      return created
        ? make("Energy", "energy", "Energy Bill Added",
            `A monthly electricity bill of PHP ${s(ref.amount)} was recorded for ${s(ref.billing_month)}/${s(ref.billing_year)}.`)
        : null;
    case "energy_submeters":
      return created
        ? make("Energy", "energy", "New Energy Submeter Created", `${s(ref.submeter_number)} — ${s(ref.submeter_name)}.`)
        : null;
    case "water_bills":
      return created
        ? make("Water", "water", "Water Bill Added",
            `A monthly water bill of PHP ${s(ref.amount)} was recorded for ${s(ref.billing_month)}/${s(ref.billing_year)}.`)
        : null;
    case "water_meter_readings":
      return created
        ? make("Water", "water", "Water Meter Reading Added",
            `Reading on ${s(ref.reading_date)} — ${s(ref.consumption)} m3 consumed.`)
        : null;
    case "water_submeters":
      return created
        ? make("Water", "water", "New Water Submeter Created", `${s(ref.submeter_number)} — ${s(ref.submeter_name)}.`)
        : null;
    case "fuel_transactions":
      return created
        ? make("Fuel", "fuel", "Fuel Record Added",
            `${s(ref.liters)} L of ${s(ref.fuel_type)} recorded on ${s(ref.txn_date)}.`)
        : null;
    case "fuel_odometer_readings":
      return created
        ? make("Fuel", "fuel", "Odometer Reading Added",
            `Reading on ${s(ref.reading_date)} — ${s(ref.distance)} km travelled.`)
        : null;
    default:
      return null;
  }
}

/** NTF-2026-000001: one running counter per Manila calendar year. */
async function nextNotificationId(now: Date): Promise<string> {
  const db = getFirestore();
  const year = manilaYear(now);
  const counter = db.collection("document_counters").doc(`NTF-${year}`);
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counter);
    const next = Number(snap.get("current_sequence") ?? 0) + 1;
    tx.set(counter, { document_type: "NTF", year, current_sequence: next, updated_at: now });
    return next;
  });
  return `NTF-${year}-${String(seq).padStart(6, "0")}`;
}

export async function writeNotification(
  draft: NotificationDraft,
  referenceId: string,
  createdBy: string | null,
  now: Date,
): Promise<void> {
  const id = await nextNotificationId(now);
  await getFirestore()
    .collection("notifications")
    .doc(id)
    .set({
      id,
      ...draft,
      reference_id: referenceId,
      is_read: false,
      created_at: now.toISOString(),
      created_by: createdBy ?? "System",
    });
}
