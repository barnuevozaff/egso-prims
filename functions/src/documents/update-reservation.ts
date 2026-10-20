import { randomUUID } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { parseReservation } from "./builders.js";
import { callerOf, requireRole } from "./caller.js";
import { BLOCKING_STATUSES, sameFacility, timesOverlap } from "./facilities.js";
import { attachments, record, requiredText } from "./validate.js";

/**
 * Changing a reservation's details — facility, date, times, equipment —
 * with the double-booking check inside the same transaction, as booking
 * does. Two people moving bookings into the same slot at the same moment
 * cannot both succeed. firestore.rules keep browsers from changing the
 * schedule fields any other way.
 */

/** Stages whose details may still change. */
const EDITABLE = ["Draft", "Pending", "Approved"];

export const updateReservation = onCall(async (request) => {
  const caller = callerOf(request);
  requireRole(caller, ["Administrator", "Department User"], "change reservations");
  const data = record(request.data ?? {});
  const id = requiredText(data.id, "Reservation", 40);
  const wanted = parseReservation(data.input);
  const added = attachments(data.newAttachments);
  const db = getFirestore();
  const ref = db.collection("reservations").doc(id);

  return db.runTransaction(
    async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", `Reservation not found: ${id}`);
      const status = String(snap.get("status"));
      if (!EDITABLE.includes(status)) {
        throw new HttpsError("failed-precondition", `${snap.get("res_number")} is ${status} and can no longer be changed.`);
      }
      const sameDay = await tx.get(
        db.collection("reservations").where("date", "==", wanted.date).where("status", "in", [...BLOCKING_STATUSES]),
      );
      const conflicts = sameDay.docs.filter(
        (d) =>
          d.id !== id &&
          sameFacility(String(d.get("facility_id") ?? ""), wanted.facilityId) &&
          timesOverlap(wanted.startTime, wanted.endTime, String(d.get("start_time")), String(d.get("end_time"))),
      );
      if (conflicts.length > 0) {
        throw new HttpsError(
          "failed-precondition",
          `Schedule conflict with ${conflicts.map((d) => d.get("res_number")).join(", ")} — pick another slot.`,
        );
      }

      const at = new Date().toISOString();
      const patch = {
        facility_id: wanted.facilityId,
        department_code: wanted.departmentCode,
        borrower: wanted.borrower,
        contact_number: wanted.contactNumber,
        purpose: wanted.purpose,
        date: wanted.date,
        start_time: wanted.startTime,
        end_time: wanted.endTime,
        equipment: wanted.equipment.map((e) => ({ ...e, id: randomUUID() })),
        attachments: [
          ...((snap.get("attachments") as unknown[]) ?? []),
          ...added.map((a) => ({ ...a, id: randomUUID(), uploadedAt: at })),
        ],
        history: [
          ...((snap.get("history") as unknown[]) ?? []),
          { id: randomUUID(), kind: "update", text: "Reservation details updated", at },
        ],
        updated_at: at,
        // This write is the server's; the audit trail names this account.
        updated_by_uid: caller.kind === "staff" ? caller.uid : null,
      };
      tx.update(ref, patch);
      return { ...snap.data(), id, ...patch };
    },
    { maxAttempts: 10 },
  );
});
