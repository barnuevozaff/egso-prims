import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { PUBLIC_CALLABLE, callerOf, enforcePublicLimit } from "./caller.js";
import { BLOCKING_STATUSES } from "./facilities.js";
import { isoDate, record } from "./validate.js";

/**
 * Which slots are taken, for the reservation form's calendar on the public
 * portal. Supabase let anyone read the whole reservations table for this;
 * signed-out visitors cannot list Firestore reservations, so this returns
 * only what the calendar shows — number, facility, date, times and status —
 * and nothing about who booked or why.
 */
export const reservationAvailability = onCall(PUBLIC_CALLABLE, async (request) => {
  const input = record(request.data ?? {});
  const from = isoDate(input.from, "From");
  const to = isoDate(input.to, "To");
  if (to < from) throw new HttpsError("invalid-argument", "To must not be before From.");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) {
    throw new HttpsError("invalid-argument", "Ask for at most two months at a time.");
  }
  if (callerOf(request).kind === "public") await enforcePublicLimit(request, "suggest");

  const snap = await getFirestore()
    .collection("reservations")
    .where("status", "in", [...BLOCKING_STATUSES])
    .where("date", ">=", from)
    .where("date", "<=", to)
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    res_number: d.get("res_number"),
    facility_id: d.get("facility_id"),
    date: d.get("date"),
    start_time: d.get("start_time"),
    end_time: d.get("end_time"),
    status: d.get("status"),
  }));
});
