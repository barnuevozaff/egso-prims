import { dateOnly, fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { uploadAttachmentInputs } from "@/lib/storage";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import {
  BLOCKING_STATUSES,
  facilityName,
  sameFacility,
  timesOverlap,
  VOIDABLE_RESERVATION_STATUSES,
  type Reservation,
  type ReservationListFilters,
  type ReservationStatus,
  type ReservedEquipment,
} from "@/features/reservations/types";
import type { AttachmentInput } from "@/features/shared/attachment-list";

/**
 * Reservation service — Supabase-backed. Conflict checks live here so the
 * schedule can never double-book.
 */

const TABLE = "reservations";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToRes(r: any): Reservation {
  return {
    id: r.id,
    resNumber: r.res_number,
    facilityId: r.facility_id,
    departmentCode: r.department_code,
    borrower: r.borrower,
    contactNumber: r.contact_number,
    purpose: r.purpose,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    equipment: r.equipment ?? [],
    status: r.status,
    attachments: r.attachments ?? [],
    comments: r.comments ?? [],
    history: r.history ?? [],
    approvals: r.approvals ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listReservations(
  filters: ReservationListFilters = {},
): Promise<Reservation[]> {
  const db = requireDb();
  let q = db.from(TABLE).select("*").order("res_number", { ascending: false });
  if (filters.facilityId) q = q.eq("facility_id", filters.facilityId);
  if (filters.departmentCode) q = q.eq("department_code", filters.departmentCode);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("date", dateOnly(filters.dateFrom));
  if (filters.dateTo) q = q.lte("date", dateOnly(filters.dateTo));
  if (filters.search?.trim()) {
    q = q.or(
      searchOr(["res_number", "borrower", "purpose", "department_code"], filters.search),
    );
  }
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToRes);
}

export async function getReservation(id: string): Promise<Reservation | null> {
  const db = requireDb();
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToRes(data) : null;
}

/**
 * Every Pending or Approved reservation between two dates (ISO, inclusive),
 * for any facility. The form filters them by the facility as it is typed, so
 * typing does not refetch.
 */
export async function listBookingsBetween(from: string, to: string): Promise<Reservation[]> {
  const db = requireDb();
  return unwrap(
    await db
      .from(TABLE)
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .in("status", BLOCKING_STATUSES),
  ).map(rowToRes);
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

export interface ReservationDraftInput {
  facilityId: string;
  departmentCode: string;
  borrower: string;
  contactNumber: string;
  purpose: string;
  date: string;
  startTime: string;
  endTime: string;
  equipment: Omit<ReservedEquipment, "id">[];
  attachments: AttachmentInput[];
}

async function assertNoConflict(input: ReservationDraftInput, excludeId?: string) {
  const conflicts = await findConflicts(
    input.facilityId,
    input.date,
    input.startTime,
    input.endTime,
    excludeId,
  );
  if (conflicts.length > 0) {
    throw new Error(
      `Schedule conflict with ${conflicts.map((c) => c.resNumber).join(", ")} — pick another slot.`,
    );
  }
}

export async function createReservation(input: ReservationDraftInput): Promise<Reservation> {
  const db = requireDb();
  await assertNoConflict(input);
  const resNumber = await nextDocumentNumber("FR");
  const at = nowIso();
  const attachments = (await uploadAttachmentInputs(input.attachments, resNumber)).map((a) => ({
    ...a,
    id: uid(),
    uploadedAt: at,
  }));
  const row = {
    id: resNumber,
    res_number: resNumber,
    facility_id: input.facilityId,
    department_code: input.departmentCode,
    borrower: input.borrower,
    contact_number: input.contactNumber,
    purpose: input.purpose,
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
    equipment: input.equipment.map((e) => ({ ...e, id: uid() })),
    status: "Pending" as ReservationStatus,
    attachments,
    comments: [],
    history: [
      { id: uid(), kind: "create", text: `${resNumber} created by ${input.borrower}`, at },
      { id: uid(), kind: "status", text: "Status → Pending", at },
    ],
    approvals: [
      { step: "Created", by: input.borrower, at },
      { step: "Reviewed", by: "Marites Villanueva", office: "General Services Office", at },
    ],
    created_at: at,
    updated_at: at,
  };
  return rowToRes(unwrap(await db.from(TABLE).insert(row).select().single()));
}

export async function updateReservation(
  id: string,
  input: ReservationDraftInput,
): Promise<Reservation> {
  const db = requireDb();
  await assertNoConflict(input, id);
  const current = await getReservation(id);
  if (!current) throw new Error(`Reservation not found: ${id}`);
  const at = nowIso();
  const uploaded = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    current.resNumber,
  );
  const row = {
    facility_id: input.facilityId,
    department_code: input.departmentCode,
    borrower: input.borrower,
    contact_number: input.contactNumber,
    purpose: input.purpose,
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
    equipment: input.equipment.map((e) => ({ ...e, id: uid() })),
    attachments: [
      ...current.attachments,
      ...uploaded.map((a) => ({ ...a, id: uid(), uploadedAt: at })),
    ],
    history: [
      ...current.history,
      { id: uid(), kind: "update", text: "Reservation details updated", at },
    ],
    updated_at: at,
  };
  return rowToRes(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function deleteReservations(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(TABLE).delete().in("id", ids));
}

export async function setReservationStatus(
  id: string,
  status: ReservationStatus,
  options: { by?: string; office?: string; remarks?: string } = {},
): Promise<Reservation> {
  const db = requireDb();
  const current = await getReservation(id);
  if (!current) throw new Error(`Reservation not found: ${id}`);
  const at = nowIso();
  const row = {
    status,
    approvals: [
      ...current.approvals,
      { step: status, by: options.by, office: options.office, at, remarks: options.remarks },
    ],
    history: [
      ...current.history,
      {
        id: uid(),
        kind: "status",
        text: options.remarks ? `Status → ${status}: ${options.remarks}` : `Status → ${status}`,
        at,
      },
    ],
    updated_at: at,
  };
  return rowToRes(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

/**
 * Voids a booking instead of deleting it: the status becomes Cancelled, the
 * slot is freed, and the number, record and history stay, with the reason
 * in the approval timeline. Completed, Rejected and Cancelled bookings are
 * final.
 */
export async function cancelReservation(
  id: string,
  input: { reason: string; by: string; office?: string },
): Promise<Reservation> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for voiding the reservation.");
  const current = await getReservation(id);
  if (!current) throw new Error(`Reservation not found: ${id}`);
  if (!VOIDABLE_RESERVATION_STATUSES.includes(current.status)) {
    throw new Error(`${current.resNumber} is ${current.status} and cannot be voided.`);
  }
  return setReservationStatus(id, "Cancelled", { by: input.by, office: input.office, remarks: reason });
}

export async function addReservationComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<Reservation> {
  const db = requireDb();
  const current = await getReservation(id);
  if (!current) throw new Error(`Reservation not found: ${id}`);
  const at = nowIso();
  const row = {
    comments: [...current.comments, { id: uid(), createdAt: at, ...input }],
    history: [
      ...current.history,
      { id: uid(), kind: "comment", text: `${input.author} commented`, at },
    ],
    updated_at: at,
  };
  return rowToRes(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function removeReservationAttachment(
  id: string,
  attachmentId: string,
): Promise<Reservation> {
  const db = requireDb();
  const current = await getReservation(id);
  if (!current) throw new Error(`Reservation not found: ${id}`);
  const removed = current.attachments.find((a) => a.id === attachmentId);
  const at = nowIso();
  if (removed?.path) {
    await db.storage.from("attachments").remove([removed.path]);
  }
  const row = {
    attachments: current.attachments.filter((a) => a.id !== attachmentId),
    history: [
      ...current.history,
      {
        id: uid(),
        kind: "attachment",
        text: `Attachment removed${removed ? `: ${removed.name}` : ""}`,
        at,
      },
    ],
    updated_at: at,
  };
  return rowToRes(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export function exportReservationsCsv(rows: Reservation[]): string {
  const header = ["Reservation", "Facility", "Office", "Borrower", "Purpose", "Date", "Start", "End", "Status"];
  const lines = rows.map((r) =>
    [
      r.resNumber,
      `"${facilityName(r.facilityId)}"`,
      r.departmentCode,
      `"${r.borrower}"`,
      `"${r.purpose.replaceAll('"', '""')}"`,
      r.date,
      r.startTime,
      r.endTime,
      r.status,
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
