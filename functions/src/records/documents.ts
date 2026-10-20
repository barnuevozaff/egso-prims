import { randomUUID } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { allocateDocumentNumber, manilaYear, readNumberingSettings } from "../numbering.js";
import { callerOf, requireRole } from "../documents/caller.js";
import { isoDate, list, record, requiredText, text } from "../documents/validate.js";
import { fileDocument, readForFiling, unfileDocument, type DocType, type FilingReads } from "./room.js";

/**
 * The three National Archives forms of Records Management — Records
 * Disposition Schedule (RDS), Records Inventory and Appraisal (RIA), Request
 * for Authority to Dispose of Records (RAD) — saved with their lines, their
 * number and their place in the Records Room in one transaction.
 *
 * What the Supabase version did in several steps, here at once:
 *   - the header and its lines are one document on paper, so a header is
 *     never saved without them (the browser used to delete a header whose
 *     lines failed);
 *   - the number is spent only on a form that is saved;
 *   - becoming Approved files the form in the current box for its kind and
 *     year, and leaving Approved takes it out (record_file_on_approval, 047).
 *
 * Lines are renumbered 1, 2, 3 … on every save, as before: a form that
 * printed 1, 2, 4 would read as a missing item. A schedule's record series
 * keep their IDs across saves; inventory and disposal lines are replaced.
 * Administrators only.
 */

type Row = Record<string, unknown>;
type Check = (value: unknown, label: string) => unknown;

const invalid = (m: string) => new HttpsError("invalid-argument", m);
const STATUSES = ["Draft", "Submitted", "Approved", "Returned"];

const req: Check = (v, l) => requiredText(v, l, 2000).trim();
const opt: Check = (v, l) => text(v, l, { max: 2000, optional: true })?.trim() || null;
const date: Check = (v, l) => isoDate(v, l);
const status: Check = (v) => {
  if (!STATUSES.includes(String(v))) throw invalid("Status must be Draft, Submitted, Approved or Returned.");
  return v;
};
const years: Check = (v, l) => {
  const n = Number(v);
  if (typeof v !== "number" || !Number.isInteger(n) || n < 0 || n > 999) {
    throw invalid(`${l} must be a whole number of years, 0 or more.`);
  }
  return n;
};
const oneOf =
  (values: string[]): Check =>
  (v, l) => {
    if (v === null || v === undefined || v === "") return null;
    if (!values.includes(String(v))) throw invalid(`${l} must be one of ${values.join(", ")}.`);
    return v;
  };

interface Spec {
  collection: string;
  lines: string;
  parentField: string;
  numberField: string;
  dateField: string;
  agencyField: string;
  header: Record<string, Check>;
  line: Record<string, Check>;
  /** Record series keep their IDs across saves (044 pointed at them). */
  keepLineIds: boolean;
  label: string;
}

export const SPECS: Record<DocType, Spec> = {
  RDS: {
    collection: "disposition_schedules",
    lines: "record_series",
    parentField: "schedule_id",
    numberField: "schedule_no",
    dateField: "date_prepared",
    agencyField: "agency_name",
    header: { agency_name: req, agency_address: req, date_prepared: date, status },
    line: {
      title_and_description: req,
      retention_active: years,
      retention_storage: years,
      remarks: opt,
    },
    keepLineIds: true,
    label: "A disposition schedule",
  },
  RIA: {
    collection: "inventory_appraisals",
    lines: "inventory_records",
    parentField: "appraisal_id",
    numberField: "inventory_no",
    dateField: "date_prepared",
    agencyField: "office_name",
    header: {
      office_name: req,
      department_division: opt,
      section_unit: opt,
      telephone_no: opt,
      email_address: opt,
      office_address: req,
      person_in_charge: opt,
      date_prepared: date,
      prepared_by: opt,
      prepared_by_position: opt,
      assisted_by: opt,
      approved_by: opt,
      status,
    },
    line: {
      title_and_description: req,
      period_covered: opt,
      volume: opt,
      records_medium: opt,
      restrictions: opt,
      location_of_records: opt,
      frequency_of_use: opt,
      duplication: opt,
      time_value: oneOf(["T", "P"]),
      utility_value: oneOf(["Adm", "F", "L", "Arc"]),
      retention_active: years,
      retention_storage: years,
      disposition_provision: opt,
    },
    keepLineIds: false,
    label: "An inventory",
  },
  RAD: {
    collection: "disposal_requests",
    lines: "disposal_items",
    parentField: "request_id",
    numberField: "request_no",
    dateField: "request_date",
    agencyField: "agency_name",
    header: {
      agency_name: req,
      agency_address: req,
      request_date: date,
      telephone_number: opt,
      email_address: opt,
      location_of_records: opt,
      volume_cubic_meter: opt,
      prepared_by: opt,
      prepared_by_position: opt,
      certified_by: opt,
      certified_by_position: opt,
      status,
    },
    line: {
      grds_rds_item_no: opt,
      title_and_description: req,
      period_covered: opt,
      retention_and_provisions: opt,
    },
    keepLineIds: false,
    label: "A disposal request",
  },
};

function checkFields(raw: unknown, fields: Record<string, Check>, where = ""): Row {
  const input = record(raw);
  const unknown = Object.keys(input).filter((k) => !(k in fields) && k !== "id");
  if (unknown.length) throw invalid(`Unexpected field${where}: ${unknown.join(", ")}.`);
  return Object.fromEntries(Object.entries(fields).map(([k, check]) => [k, check(input[k], k)]));
}

/** The number's claim: no two forms of a kind share a number (the Postgres unique index). */
const numberClaim = (spec: Spec, number: string) =>
  getFirestore().doc(`unique_keys/${spec.collection}.${spec.numberField}:${number}`);

const isDocType = (t: unknown): t is DocType => t === "RDS" || t === "RIA" || t === "RAD";

/** The year a form is filed under: the year of its own date, as 047 took it. */
const yearOf = (iso: string) => Number(iso.slice(0, 4));

export const saveRecordsDocument = onCall(async (request) => {
  const caller = callerOf(request);
  requireRole(caller, ["Administrator"], "change Records Management documents");
  const uid = caller.kind === "staff" ? caller.uid : null;
  const input = record(request.data ?? {});
  if (!isDocType(input.type)) throw invalid("Unknown records document type.");
  const type = input.type;
  const spec = SPECS[type];
  const existingId = input.id === undefined || input.id === null ? null : requiredText(input.id, "Document", 100);
  const header = checkFields(input.header, spec.header);
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw invalid(`${spec.label} needs at least one record series.`);
  }
  const lines = list(input.lines, "Lines", (l, i) => {
    const row = checkFields(l, spec.line, ` on item ${i + 1}`);
    return { ...row, requestedId: typeof l.id === "string" && l.id ? l.id : null };
  });
  const settings = existingId ? null : await readNumberingSettings();
  const db = getFirestore();

  return db.runTransaction(
    async (tx) => {
      const id = existingId ?? randomUUID();
      const ref = db.collection(spec.collection).doc(id);
      const current = existingId ? await tx.get(ref) : null;
      if (existingId && !current?.exists) throw new HttpsError("not-found", "That document no longer exists.");
      if (current?.get("status") === "Cancelled") {
        throw new HttpsError("failed-precondition", `${String(current.get(spec.numberField))} is voided and can no longer be changed.`);
      }
      const oldLines = existingId
        ? (await tx.get(db.collection(spec.lines).where(spec.parentField, "==", id))).docs
        : [];

      const wasApproved = current?.get("status") === "Approved";
      const approved = header.status === "Approved";
      const docDate = String(header[spec.dateField]);
      const year = yearOf(docDate);
      const filing: FilingReads | null =
        approved || wasApproved ? await readForFiling(tx, type, id, year) : null;

      // Last read: the number (its counter, and whether it is already held).
      const number = existingId
        ? String(current!.get(spec.numberField))
        : await allocateDocumentNumber(tx, type, manilaYear(new Date()), settings!, async (n) =>
            (await tx.get(numberClaim(spec, n))).exists,
          );

      // ---- writes ----
      const at = new Date().toISOString();
      const row: Row = existingId
        ? { ...current!.data(), ...header, id, updated_at: at, updated_by_uid: uid }
        : {
            id,
            [spec.numberField]: number,
            ...header,
            created_at: at,
            updated_at: at,
            created_by_uid: uid,
            updated_by_uid: uid,
          };
      if (existingId) tx.update(ref, { ...header, updated_at: at, updated_by_uid: uid });
      else {
        tx.create(ref, row);
        tx.create(numberClaim(spec, number), { collection: spec.collection, doc_id: id, created_at: at });
      }

      const keep = new Set(spec.keepLineIds ? oldLines.map((d) => d.id) : []);
      const written = new Set<string>();
      lines.forEach(({ requestedId, ...line }, i) => {
        const lineId = requestedId && keep.has(requestedId) ? requestedId : randomUUID();
        written.add(lineId);
        const lineRow: Row = {
          ...line,
          id: lineId,
          [spec.parentField]: id,
          item_number: i + 1,
          updated_at: at,
          updated_by_uid: uid,
        };
        const fields: Row = line;
        if (fields.retention_active !== undefined) {
          // Generated in Postgres (040, 041).
          lineRow.retention_total = Number(fields.retention_active) + Number(fields.retention_storage);
        }
        const lineRef = db.collection(spec.lines).doc(lineId);
        if (keep.has(lineId)) tx.update(lineRef, lineRow);
        else tx.create(lineRef, { ...lineRow, created_at: at, created_by_uid: uid });
      });
      oldLines.filter((d) => !written.has(d.id)).forEach((d) => tx.delete(d.ref));

      if (approved && filing) {
        fileDocument(
          tx,
          { type, sourceId: id, documentNo: number, agency: String(header[spec.agencyField] ?? ""), date: docDate },
          year,
          filing,
          uid,
          at,
        );
      } else if (wasApproved && filing) {
        unfileDocument(tx, filing);
      }
      return { ...row, lines: lines.length };
    },
    { maxAttempts: 10 },
  );
});

/**
 * Voids a form instead of deleting it (approved policy, 2026-10-20). The
 * form keeps its number, its lines and its history; its status becomes
 * Cancelled, with the reason, the Administrator and the time. An approved
 * form stays where it was filed — its box, shelf and filing history are
 * kept for audit — and its contents line is marked voided, so it drops out
 * of the room's active records and of the box's capacity. No box is moved
 * or emptied. Any status can be voided; a voided form cannot be changed.
 */
export const voidRecordsDocument = onCall(async (request) => {
  const caller = callerOf(request);
  requireRole(caller, ["Administrator"], "void Records Management documents");
  const input = record(request.data ?? {});
  if (!isDocType(input.type)) throw invalid("Unknown records document type.");
  const type = input.type;
  const spec = SPECS[type];
  const id = requiredText(input.id, "Document", 100);
  const reason = requiredText(input.reason, "Reason", 500).trim();
  if (!reason) throw invalid("Give a reason for voiding the document.");
  const uid = caller.kind === "staff" ? caller.uid : null;
  const by = caller.kind === "staff" ? caller.email || caller.uid : "";
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = db.collection(spec.collection).doc(id);
    const header = await tx.get(ref);
    if (!header.exists) throw new HttpsError("not-found", "That document no longer exists.");
    const number = String(header.get(spec.numberField));
    if (header.get("status") === "Cancelled") throw new HttpsError("failed-precondition", `${number} is already voided.`);
    const content = await tx.get(db.collection("record_box_contents").doc(`${type}-${id}`));
    const at = new Date().toISOString();
    const patch = {
      status: "Cancelled",
      status_before_void: header.get("status"),
      void_reason: reason,
      voided_at: at,
      voided_by_uid: uid,
      voided_by: by,
      updated_at: at,
      updated_by_uid: uid,
    };
    tx.update(ref, patch);
    if (content.exists) tx.update(content.ref, { voided: true, voided_at: at, updated_at: at, updated_by_uid: uid });
    return { ...header.data(), id, ...patch };
  });
});
