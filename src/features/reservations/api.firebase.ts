import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";

import { dateOnly } from "@/lib/db";
import {
  callFunction,
  fetchAllRows,
  firestore,
  friendlyFirebaseError,
  getRow,
  matchesSearch,
  updateRow,
  writerUid,
  type Row,
} from "@/lib/firestore";
import { removeAttachmentFile, uploadAttachmentInputs } from "@/lib/firebase-storage";
import {
  exportReservationsCsv,
  rowToRes,
  type ReservationDraftInput,
} from "@/features/reservations/api.supabase";
import {
  BLOCKING_STATUSES,
  sameFacility,
  timesOverlap,
  VOIDABLE_RESERVATION_STATUSES,
  type Reservation,
  type ReservationListFilters,
  type ReservationStatus,
} from "@/features/reservations/types";

/**
 * Reservation service — Firestore-backed. Same signatures as api.supabase.ts.
 *
 * Booking goes through the createReservation Cloud Function, which checks
 * for a double booking and numbers and saves the reservation in one
 * transaction, so two people cannot take the same slot at the same moment.
 * The browser-side check below still runs first, to fail fast with the same
 * message, and on edits.
 */

export { exportReservationsCsv };

const TABLE = "reservations";
const SEARCH_FIELDS = ["res_number", "borrower", "purpose", "department_code"];
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const notFound = (id: string) => `Reservation not found: ${id}`;

function serverFilters(filters: ReservationListFilters): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (filters.facilityId) c.push(where("facility_id", "==", filters.facilityId));
  if (filters.departmentCode) c.push(where("department_code", "==", filters.departmentCode));
  if (filters.status) c.push(where("status", "==", filters.status));
  return c;
}

export async function listReservations(filters: ReservationListFilters = {}): Promise<Reservation[]> {
  const rows = await fetchAllRows(TABLE, [...serverFilters(filters), orderBy("res_number", "desc")]);
  const from = filters.dateFrom ? dateOnly(filters.dateFrom) : undefined;
  const to = filters.dateTo ? dateOnly(filters.dateTo) : undefined;
  return rows
    .filter(
      (r) =>
        (!from || r.date >= from) && (!to || r.date <= to) && matchesSearch(r, SEARCH_FIELDS, filters.search),
    )
    .map(rowToRes);
}

export async function getReservation(id: string): Promise<Reservation | null> {
  const row = await getRow(TABLE, id);
  return row ? rowToRes(row) : null;
}

/**
 * Every Pending or Approved reservation between two dates (ISO, inclusive),
 * for any facility. Staff read Firestore directly; the public portal, which
 * may not list reservations, gets the taken slots from the
 * reservationAvailability function (number, facility, date, times, status).
 */
export async function listBookingsBetween(from: string, to: string): Promise<Reservation[]> {
  try {
    const snap = await getDocs(
      query(
        collection(firestore(), TABLE),
        where("status", "in", [...BLOCKING_STATUSES]),
        where("date", ">=", from),
        where("date", "<=", to),
      ),
    );
    return snap.docs.map((d) => rowToRes({ ...d.data(), id: d.id }));
  } catch (e) {
    if ((e as { code?: string }).code !== "permission-denied") throw friendlyFirebaseError(e);
    const slots = await callFunction<Row[]>("reservationAvailability", { from, to });
    return slots.map((s) => rowToRes(s));
  }
}

/**
 * Reservations that occupy the requested slot (Pending/Approved overlaps).
 * The facility is matched as the form matches it (see sameFacility), not by
 * exact text, because facilities are typed by hand.
 */
export async function findConflicts(
  facilityId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
): Promise<Reservation[]> {
  const rows = await listBookingsBetween(date, date);
  return rows.filter(
    (r) =>
      r.id !== excludeId &&
      sameFacility(r.facilityId, facilityId) &&
      timesOverlap(startTime, endTime, r.startTime, r.endTime),
  );
}

async function assertNoConflict(input: ReservationDraftInput, excludeId?: string) {
  const conflicts = await findConflicts(input.facilityId, input.date, input.startTime, input.endTime, excludeId);
  if (conflicts.length > 0) {
    throw new Error(`Schedule conflict with ${conflicts.map((c) => c.resNumber).join(", ")} — pick another slot.`);
  }
}

export async function createReservation(input: ReservationDraftInput): Promise<Reservation> {
  await assertNoConflict(input);
  const attachments = await uploadAttachmentInputs(input.attachments, `upload-${uid()}`);
  const row = await callFunction<Row>("createReservation", { input: { ...input, attachments } });
  return rowToRes(row);
}

/**
 * Changing a booking goes through the updateReservation Cloud Function, which
 * checks for a double booking in the same transaction as the change, so two
 * people moving bookings into one slot cannot both succeed.
 */
export async function updateReservation(id: string, input: ReservationDraftInput): Promise<Reservation> {
  const current = await getReservation(id);
  if (!current) throw new Error(notFound(id));
  const newAttachments = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    current.resNumber,
  );
  const row = await callFunction<Row>("updateReservation", {
    id,
    input: { ...input, attachments: [] },
    newAttachments,
  });
  return rowToRes(row);
}

export async function deleteReservations(ids: string[]): Promise<void> {
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

export async function setReservationStatus(
  id: string,
  status: ReservationStatus,
  options: { by?: string; office?: string; remarks?: string } = {},
): Promise<Reservation> {
  const at = nowIso();
  return rowToRes(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      status,
      approvals: [
        ...(r.approvals ?? []),
        { step: status, by: options.by, office: options.office, at, remarks: options.remarks, byUid: writerUid() },
      ],
      history: [
        ...(r.history ?? []),
        {
          id: uid(),
          kind: "status",
          text: options.remarks ? `Status → ${status}: ${options.remarks}` : `Status → ${status}`,
          at,
        },
      ],
      updated_at: at,
    })),
  );
}

/**
 * Voids a booking instead of deleting it (see api.supabase.ts). Checked
 * again inside the transaction; firestore.rules require the reason and that
 * the step is signed by the account taking it.
 */
export async function cancelReservation(
  id: string,
  input: { reason: string; by: string; office?: string },
): Promise<Reservation> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for voiding the reservation.");
  const at = nowIso();
  return rowToRes(
    await updateRow(TABLE, id, notFound(id), (r) => {
      if (!VOIDABLE_RESERVATION_STATUSES.includes(r.status)) {
        throw new Error(`${r.res_number} is ${r.status} and cannot be voided.`);
      }
      return {
        status: "Cancelled",
        approvals: [
          ...(r.approvals ?? []),
          { step: "Cancelled", by: input.by, office: input.office, at, remarks: reason, byUid: writerUid() },
        ],
        history: [...(r.history ?? []), { id: uid(), kind: "status", text: `Status → Cancelled: ${reason}`, at }],
        updated_at: at,
      };
    }),
  );
}

export async function addReservationComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<Reservation> {
  const at = nowIso();
  return rowToRes(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      comments: [...(r.comments ?? []), { id: uid(), createdAt: at, ...input }],
      history: [...(r.history ?? []), { id: uid(), kind: "comment", text: `${input.author} commented`, at }],
      updated_at: at,
    })),
  );
}

export async function removeReservationAttachment(id: string, attachmentId: string): Promise<Reservation> {
  const current = await getReservation(id);
  if (!current) throw new Error(notFound(id));
  const removed = current.attachments.find((a) => a.id === attachmentId);
  if (removed?.path) await removeAttachmentFile(removed.path);
  const at = nowIso();
  return rowToRes(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      attachments: (r.attachments ?? []).filter((a: { id: string }) => a.id !== attachmentId),
      history: [
        ...(r.history ?? []),
        { id: uid(), kind: "attachment", text: `Attachment removed${removed ? `: ${removed.name}` : ""}`, at },
      ],
      updated_at: at,
    })),
  );
}
