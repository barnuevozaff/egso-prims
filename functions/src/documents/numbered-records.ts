import { randomUUID } from "node:crypto";

import { getFirestore, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { allocateDocumentNumber, manilaYear, readNumberingSettings } from "../numbering.js";
import { callerOf, requireRole } from "./caller.js";
import { closedReason, requireOpenHolder } from "./holder-status.js";
import { amount, isoDate, record, requiredText, text } from "./validate.js";

/**
 * Numbered records of the utility and violation modules — energy bills (EC),
 * water bills (WC), fuel transactions (FC), violation tickets (VT) — and
 * fuel trips with their monthly control numbers. Each is numbered and saved
 * in one transaction, like the procurement documents (create.ts): a number
 * is spent only on a record that exists, and two saves at the same moment
 * never share one.
 *
 * The browser builds the record as it did for Supabase; here it is checked
 * field by field against the columns the table has, anything else is
 * refused, and the columns Postgres generated (totals, balances) are
 * computed here rather than trusted. Administrators only, as before.
 */

type Row = Record<string, unknown>;

const invalid = (message: string) => new HttpsError("invalid-argument", message);
const pad2 = (n: unknown) => String(n).padStart(2, "0");

/** Field checks, by column. "?" columns may be empty (stored as null). */
export type Check = (value: unknown, label: string) => unknown;
const str: Check = (v, l) => requiredText(v, l, 500);
const optStr: Check = (v, l) => text(v, l, { max: 2000, optional: true })?.trim() || null;
const num: Check = (v, l) => amount(v, l);
const optNum: Check = (v, l) => (v === null || v === undefined ? null : amount(v, l));
const positive: Check = (v, l) => amount(v, l, { positive: true });
const date: Check = (v, l) => isoDate(v, l);
const month: Check = (v, l) => {
  const m = amount(v, l);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw invalid(`${l} must be a month (1–12).`);
  return m;
};
const year: Check = (v, l) => {
  const y = amount(v, l);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw invalid(`${l} must be a year.`);
  return y;
};

export const checks = { str, optStr, num, optNum, positive, date, month, year };

/**
 * One active record per period (a bill per account and month): the active
 * record holds unique_keys/{collection}.period:{periodId}; a voided one has
 * given it up (utility-records.ts). Reads only. `periodFree` says whether
 * the period ID itself is free; when a voided record still stands there,
 * the replacement takes the period ID plus a suffix.
 */
export async function readPeriod(
  tx: Transaction,
  collection: string,
  periodId: string,
  duplicate: string,
): Promise<{ claimRef: DocumentReference; periodFree: boolean }> {
  const db = getFirestore();
  const claimRef = db.doc(`unique_keys/${collection}.period:${periodId}`);
  const claim = await tx.get(claimRef);
  if (claim.exists) {
    const holder = await tx.get(db.collection(collection).doc(String(claim.get("doc_id"))));
    if (holder.exists && holder.get("voided") !== true) throw new HttpsError("already-exists", duplicate);
  }
  const atPeriod = await tx.get(db.collection(collection).doc(periodId));
  // A record saved before period claims existed holds its period by its ID.
  if (atPeriod.exists && atPeriod.get("voided") !== true) throw new HttpsError("already-exists", duplicate);
  return { claimRef, periodFree: !atPeriod.exists };
}

export function checked(raw: unknown, fields: Record<string, Check>): Row {
  const input = record(raw);
  const unknown = Object.keys(input).filter((k) => !(k in fields));
  if (unknown.length) throw invalid(`Unexpected field: ${unknown.join(", ")}.`);
  return Object.fromEntries(Object.entries(fields).map(([k, check]) => [k, check(input[k], k)]));
}

interface Spec {
  collection: string;
  numberField: string;
  fields: Record<string, Check>;
  /** The record's id; the number itself when the number is the id. */
  idFor: (row: Row, number: string) => string;
  /** Set when the id is the billing period, so a duplicate is refused before a number is spent. */
  periodId?: (row: Row) => string;
  /** The parent the record belongs to (a Postgres foreign key). */
  parent: (row: Row) => { collection: string; id: string; missing: string };
  /** Columns Postgres generated. */
  derive?: (row: Row) => Row;
  duplicate: string;
}

export const SPECS: Record<string, Spec> = {
  EC: {
    collection: "energy_bills",
    numberField: "doc_number",
    fields: { account_id: str, billing_month: month, billing_year: year, amount: num, kwh: num, remarks: optStr },
    idFor: (r) => `eb-${r.account_id}-${r.billing_year}-${pad2(r.billing_month)}`,
    periodId: (r) => `eb-${r.account_id}-${r.billing_year}-${pad2(r.billing_month)}`,
    parent: (r) => ({ collection: "energy_accounts", id: String(r.account_id), missing: "That energy account no longer exists." }),
    duplicate: "A bill for that account and billing period already exists.",
  },
  WC: {
    collection: "water_bills",
    numberField: "doc_number",
    fields: { account_id: str, billing_month: month, billing_year: year, amount: num, consumption: num, remarks: optStr },
    idFor: (r) => `wb-${r.account_id}-${r.billing_year}-${pad2(r.billing_month)}`,
    periodId: (r) => `wb-${r.account_id}-${r.billing_year}-${pad2(r.billing_month)}`,
    parent: (r) => ({ collection: "water_accounts", id: String(r.account_id), missing: "That water account no longer exists." }),
    duplicate: "A bill for that account and billing period already exists.",
  },
  FC: {
    collection: "fuel_transactions",
    numberField: "doc_number",
    fields: {
      vehicle_id: str,
      txn_date: date,
      fuel_type: str,
      liters: positive,
      price_per_liter: num,
      driver: optStr,
      odometer: optNum,
      remarks: optStr,
    },
    // The number makes the id unique; a timestamp could repeat within a millisecond.
    idFor: (r, number) => `ft-${r.vehicle_id}-${number}`,
    parent: (r) => ({ collection: "fuel_vehicles", id: String(r.vehicle_id), missing: "That vehicle no longer exists." }),
    derive: (r) => ({ total_amount: Number(r.liters) * Number(r.price_per_liter) }),
    duplicate: "That fuel record already exists.",
  },
  VT: {
    collection: "violations",
    numberField: "violation_no",
    fields: {
      violator_id: str,
      violation_type: str,
      description: optStr,
      date_issued: date,
      amount: positive,
      remarks: optStr,
      apprehended_by: optStr,
      citation_no: optStr,
    },
    idFor: (_r, number) => number,
    parent: (r) => ({ collection: "violators", id: String(r.violator_id), missing: "That violator profile no longer exists." }),
    // New violations always start unsettled (as createViolation did).
    derive: (r) => ({
      payment_status: "Pending",
      payment_date: null,
      or_number: null,
      amount_paid: 0,
      payment_method: null,
      payment_remarks: null,
      cancel_reason: null,
      outstanding_balance: Number(r.amount),
    }),
    duplicate: "That violation number is already in use.",
  },
};

/**
 * Allocates the number and writes the record inside `tx`. `before` reads
 * must already have happened (Firestore requires reads before writes).
 */
async function writeNumbered(
  tx: Transaction,
  type: string,
  spec: Spec,
  fields: Row,
  callerUid: string,
  year: number,
  settings: Awaited<ReturnType<typeof readNumberingSettings>>,
): Promise<Row> {
  const db = getFirestore();
  const parent = spec.parent(fields);
  // An archived account, an inactive vehicle or an archived profile takes no
  // new records (approved 2026-10-21).
  await requireOpenHolder(tx, parent.collection, parent.id, parent.missing);
  // One active bill per account and month, checked before a number is spent
  // (Firestore also needs every read before the counter is written). The
  // active bill holds the period's claim; voiding a bill releases it
  // (utility-records.ts), so its replacement can be saved — under the period
  // ID when that is free, or the period ID plus its number when the voided
  // bill still stands there. Ids built from the number are unique already.
  let claimRef: DocumentReference | null = null;
  let periodFree = false;
  if (spec.periodId) {
    ({ claimRef, periodFree } = await readPeriod(tx, spec.collection, spec.periodId(fields), spec.duplicate));
  }
  const number = await allocateDocumentNumber(tx, type, year, settings);
  const id =
    spec.periodId && !periodFree ? `${spec.periodId(fields)}-${number}` : spec.idFor(fields, number);
  const ref = db.collection(spec.collection).doc(id);
  const at = new Date().toISOString();
  const row: Row = {
    id,
    ...fields,
    ...spec.derive?.(fields),
    [spec.numberField]: number,
    created_at: at,
    updated_at: at,
    created_by_uid: callerUid,
  };
  tx.create(ref, row);
  if (claimRef) tx.set(claimRef, { collection: spec.collection, doc_id: id, created_at: at });
  return row;
}

export const createNumberedRecord = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "record this");
  const type = String(request.data?.type ?? "");
  const spec = SPECS[type];
  if (!spec) throw invalid("Unknown document type.");
  const fields = checked(request.data?.record, spec.fields);
  const settings = await readNumberingSettings();
  const year = manilaYear(new Date());
  const uid = caller.kind === "staff" ? caller.uid : "";
  return getFirestore().runTransaction(
    (tx) => writeNumbered(tx, type, spec, fields, uid, year, settings),
    { maxAttempts: 10 },
  );
});

/* ---------------- violations: find or open the profile, then the ticket ---------------- */

/** As normalizeName in src/features/violations/lib.ts, and name_key in migration 030. */
export const normalizeName = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Records a violation against a typed name: finds the person's profile by
 * name_key or opens one, then numbers and saves the ticket — all in one
 * transaction. Two clerks recording the same new person at once get one
 * profile, and a failed ticket leaves no stray empty profile behind (the
 * browser version had to delete one after the fact).
 */
export const recordViolation = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "record violations");
  const input = record(request.data ?? {});
  const fullName = requiredText(input.violatorName, "Violator's name", 300).trim();
  const key = normalizeName(fullName);
  if (!key) throw invalid("Enter the violator's name.");
  const ticket = record(input.record);
  const spec = SPECS.VT;
  const settings = await readNumberingSettings();
  const year = manilaYear(new Date());
  const uid = caller.kind === "staff" ? caller.uid : "";
  const db = getFirestore();
  // A deterministic claim on the name: a second profile for the same person
  // cannot be opened, even by two requests at the same moment.
  const claimRef = db.doc(`unique_keys/violators.name_key:${key.replaceAll("/", " ")}`);

  return db.runTransaction(
    async (tx) => {
      const existing = await tx.get(db.collection("violators").where("name_key", "==", key).limit(1));
      const claim = await tx.get(claimRef);
      // A claim whose profile is gone or now goes by another name is stale.
      const holder = claim.exists
        ? await tx.get(db.collection("violators").doc(String(claim.get("doc_id"))))
        : null;
      const holderLive = holder?.exists === true && holder.get("name_key") === key;
      let violatorId: string;
      let violator: Row;
      let created = false;
      let writeClaim = false;
      // An archived profile takes no new tickets, and is never restored
      // by recording one (approved 2026-10-21).
      const found = !existing.empty ? existing.docs[0] : holderLive ? holder : null;
      const closed = found ? closedReason("violators", found.data() ?? {}) : null;
      if (closed) throw new HttpsError("failed-precondition", closed);
      if (!existing.empty) {
        violator = { ...existing.docs[0].data(), id: existing.docs[0].id };
        violatorId = existing.docs[0].id;
        // A profile from before claims existed gets one now.
        writeClaim = !holderLive;
      } else if (holder && holderLive) {
        violatorId = holder.id;
        violator = { ...holder.data(), id: violatorId };
      } else {
        writeClaim = true;
        const at = new Date().toISOString();
        violatorId = `vlt-${randomUUID()}`;
        violator = {
          id: violatorId,
          full_name: fullName,
          name_key: key,
          contact_number: null,
          email: null,
          address: null,
          created_at: at,
          updated_at: at,
          created_by_uid: uid,
        };
        created = true;
      }
      // All reads first: the parent check inside writeNumbered reads the
      // violator, which for a new profile does not exist yet, so the ticket
      // is written here instead of through writeNumbered.
      const fields = checked({ ...ticket, violator_id: violatorId }, spec.fields);
      const number = await allocateDocumentNumber(tx, "VT", year, settings);
      const at = new Date().toISOString();
      if (created) tx.create(db.collection("violators").doc(violatorId), violator);
      if (writeClaim) tx.set(claimRef, { collection: "violators", doc_id: violatorId, created_at: at });
      const row: Row = {
        id: number,
        ...fields,
        ...spec.derive?.(fields),
        violation_no: number,
        created_at: at,
        updated_at: at,
        created_by_uid: uid,
      };
      tx.create(db.collection("violations").doc(number), row);
      return { violation: row, violator, createdProfile: created };
    },
    { maxAttempts: 10 },
  );
});

/* ---------------- fuel trips: monthly control numbers ---------------- */

export const TRIP_FIELDS: Record<string, Check> = {
  vehicle_id: str,
  trip_date: date,
  purpose: optStr,
  origin: optStr,
  destination: optStr,
  driver: optStr,
  passengers: optStr,
  no_of_trips: positive,
  source: str,
  beginning_odometer: num,
  ending_odometer: num,
  km_per_liter: num,
  beginning_fuel: num,
  fuel_added: num,
  status: str,
  remarks: optStr,
};

/** The trip columns Postgres generated (migration 020). */
export function tripDerived(r: Row): Row {
  const distance = Number(r.ending_odometer) - Number(r.beginning_odometer);
  const kmpl = Number(r.km_per_liter);
  const fuelUsed = kmpl ? distance / kmpl : null;
  return {
    distance_travelled: distance,
    fuel_total: Number(r.beginning_fuel) + Number(r.fuel_added),
    fuel_used: fuelUsed,
    ending_fuel: fuelUsed === null ? null : Number(r.beginning_fuel) + Number(r.fuel_added) - fuelUsed,
  };
}

/**
 * Records a trip under the next control number of its month (2026-07-0021;
 * the sequence restarts every month, matching the paper Trip Summary). The
 * month's counter is document_counters/TRIP-YYYY-MM; the first trip of a
 * month opens it above any control number already used that month, so
 * migrated trips are never duplicated.
 */
export const createFuelTrip = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "record trips");
  const fields = checked(request.data?.record, TRIP_FIELDS);
  if (Number(fields.ending_odometer) < Number(fields.beginning_odometer)) {
    throw invalid("Odometer IN cannot be lower than Odometer OUT.");
  }
  const prefix = String(fields.trip_date).slice(0, 7);
  const db = getFirestore();
  const counterRef = db.doc(`document_counters/TRIP-${prefix}`);
  const uid = caller.kind === "staff" ? caller.uid : "";

  return db.runTransaction(
    async (tx) => {
      await requireOpenHolder(tx, "fuel_vehicles", String(fields.vehicle_id), "That vehicle no longer exists.");
      const counter = await tx.get(counterRef);
      let last = counter.exists ? Number(counter.get("current_sequence")) : 0;
      if (!counter.exists) {
        const used = await tx.get(
          db
            .collection("fuel_trips")
            .where("control_no", ">=", `${prefix}-`)
            .where("control_no", "<", `${prefix}-`)
            .orderBy("control_no", "desc")
            .limit(1),
        );
        last = used.empty ? 0 : Number(String(used.docs[0].get("control_no")).slice(prefix.length + 1)) || 0;
      }
      const seq = last + 1;
      const at = new Date().toISOString();
      const controlNo = `${prefix}-${String(seq).padStart(4, "0")}`;
      const row: Row = {
        id: `trp-${fields.vehicle_id}-${controlNo}`,
        control_no: controlNo,
        ...fields,
        ...tripDerived(fields),
        created_at: at,
        updated_at: at,
        created_by_uid: uid,
      };
      tx.set(counterRef, { document_type: "TRIP", year: Number(prefix.slice(0, 4)), current_sequence: seq, updated_at: new Date() });
      tx.create(db.collection("fuel_trips").doc(String(row.id)), row);
      return row;
    },
    { maxAttempts: 10 },
  );
});
