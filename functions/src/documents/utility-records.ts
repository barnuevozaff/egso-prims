import { randomUUID } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf, requireRole } from "./caller.js";
import { checked, SPECS, TRIP_FIELDS, tripDerived, type Check } from "./numbered-records.js";
import { ENTRIES } from "./utility-entries.js";
import { amount, isoDate, record, requiredText, text } from "./validate.js";

/**
 * Corrections and voids of the finalized utility records — energy bills
 * (EC), water bills (WC), fuel purchases (FC) and fuel trips (control
 * numbers). Approved policy (2026-10-20):
 *
 *   - A correction keeps the record and its number and changes only its
 *     values; the previous and new value of every changed field, the reason,
 *     the account and the time go into the record's `revisions`. Values
 *     derived from others (a purchase's total, a trip's fuel) are recorded
 *     too, so a change in pesos is always visible.
 *   - A void is the reversal: the record keeps its number, its values and
 *     its history, is marked voided with the reason, account and time, and
 *     drops out of active totals (the lists leave it out unless asked).
 *     Voiding a bill gives its month up, so a corrected bill can be saved.
 *   - Neither is a deletion; the browser can no longer delete these records
 *     (firestore.rules). Administrators only.
 *
 * The unnumbered entries — submeter bills, water meter readings, odometer
 * readings — are corrected and voided the same way (approved 2026-10-21);
 * a voided submeter bill gives its month up too.
 */

type Row = Record<string, unknown>;
type Kind = "EC" | "WC" | "FC" | "TRIP" | "ESB" | "WSB" | "WMR" | "ODO";

// Field checks for the unnumbered entries (approved 2026-10-21: their
// corrections keep history too).
const num: Check = (v, l) => amount(v, l);
const optStr: Check = (v, l) => text(v, l, { max: 2000, optional: true })?.trim() || null;
const day: Check = (v, l) => isoDate(v, l);
const SUBMETER_BILL: Record<string, Check> = { consumption: num, amount: num, remarks: optStr };

/** Corrections that may not happen whatever the reason. */
const guards: Partial<Record<Kind, (next: Row, current: Row) => string | null>> = {
  TRIP: (n, c) => {
    if (Number(n.ending_odometer) < Number(n.beginning_odometer)) return "Odometer IN cannot be lower than Odometer OUT.";
    // A trip keeps the control number of its month (2026-10-0021): moving
    // it to another month would leave it numbered in the wrong sequence.
    const month = String(c.control_no ?? "").slice(0, 7);
    if (month && String(n.trip_date).slice(0, 7) !== month) {
      return `Trip ${String(c.control_no)} belongs to ${month}; its date must stay in that month. Void it and record the trip again in the right month.`;
    }
    return null;
  },
  WMR: (n) => (Number(n.current_reading) < Number(n.previous_reading) ? "The current reading cannot be lower than the previous reading." : null),
  ODO: (n) =>
    Number(n.current_odometer) < Number(n.previous_odometer) ? "The current odometer cannot be lower than the previous reading." : null,
};

const without = (fields: Record<string, Check>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(fields).filter(([k]) => !keys.includes(k)));

const KINDS: Record<Kind, { collection: string; label: string; correctable: Record<string, Check>; derive?: (r: Row) => Row }> = {
  EC: {
    collection: "energy_bills",
    label: "energy bill",
    correctable: without(SPECS.EC.fields, "account_id", "billing_month", "billing_year"),
  },
  WC: {
    collection: "water_bills",
    label: "water bill",
    correctable: without(SPECS.WC.fields, "account_id", "billing_month", "billing_year"),
  },
  FC: {
    collection: "fuel_transactions",
    label: "fuel purchase",
    correctable: without(SPECS.FC.fields, "vehicle_id"),
    derive: SPECS.FC.derive,
  },
  TRIP: {
    collection: "fuel_trips",
    label: "trip",
    correctable: without(TRIP_FIELDS, "vehicle_id"),
    derive: tripDerived,
  },
  ESB: { collection: "energy_submeter_bills", label: "submeter bill", correctable: SUBMETER_BILL },
  WSB: { collection: "water_submeter_bills", label: "submeter bill", correctable: SUBMETER_BILL },
  WMR: {
    collection: "water_meter_readings",
    label: "meter reading",
    correctable: { reading_date: day, previous_reading: num, current_reading: num, amount: num, remarks: optStr },
    // Generated in Postgres (migration 010).
    derive: (r) => ({ consumption: Number(r.current_reading) - Number(r.previous_reading) }),
  },
  ODO: {
    collection: "fuel_odometer_readings",
    label: "odometer reading",
    correctable: {
      reading_date: day,
      previous_odometer: num,
      current_odometer: num,
      fuel_cost: num,
      fuel_liters: num,
      remarks: optStr,
    },
    // Generated in Postgres (migration 011).
    derive: (r) => ({ distance: Number(r.current_odometer) - Number(r.previous_odometer) }),
  },
};

const kindOf = (v: unknown): Kind => {
  if (["EC", "WC", "FC", "TRIP", "ESB", "WSB", "WMR", "ODO"].includes(String(v))) return v as Kind;
  throw new HttpsError("invalid-argument", "Unknown record type.");
};

const reasonOf = (v: unknown, what: string) => {
  const reason = requiredText(v, "Reason", 500).trim();
  if (!reason) throw new HttpsError("invalid-argument", `Give a reason for the ${what}.`);
  return reason;
};

const same = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : (a ?? null) === (b ?? null);

export const correctUtilityRecord = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "correct finalized records");
  const input = record(request.data ?? {});
  const type = kindOf(input.type);
  const kind = KINDS[type];
  const id = requiredText(input.id, "Record", 200);
  const reason = reasonOf(input.reason, "correction");
  const fields = checked(input.changes, kind.correctable);
  const uid = caller.kind === "staff" ? caller.uid : "";
  const by = caller.kind === "staff" ? caller.email || caller.uid : "";
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const ref = db.collection(kind.collection).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", `That ${kind.label} no longer exists.`);
    const current: Row = { ...snap.data(), id };
    if (current.voided === true) throw new HttpsError("failed-precondition", `A voided ${kind.label} cannot be corrected.`);
    const refused = guards[type]?.({ ...current, ...fields }, current);
    if (refused) throw new HttpsError("invalid-argument", refused);

    const next: Row = { ...fields, ...kind.derive?.({ ...current, ...fields }) };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(next)) {
      if (!same(current[k], v)) changes[k] = { from: current[k] ?? null, to: v ?? null };
    }
    if (Object.keys(changes).length === 0) {
      throw new HttpsError("failed-precondition", "Nothing was changed, so there is nothing to correct.");
    }
    const at = new Date().toISOString();
    const revision = { id: randomUUID(), at, by_uid: uid, by, reason, changes };
    const patch: Row = {
      ...Object.fromEntries(Object.keys(changes).map((k) => [k, next[k] ?? null])),
      revisions: [...((current.revisions as unknown[]) ?? []), revision],
      updated_at: at,
      updated_by_uid: uid,
    };
    tx.update(ref, patch);
    return { ...current, ...patch };
  });
});

export const voidUtilityRecord = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "void finalized records");
  const input = record(request.data ?? {});
  const type = kindOf(input.type);
  const kind = KINDS[type];
  const id = requiredText(input.id, "Record", 200);
  const reason = reasonOf(input.reason, "void");
  const uid = caller.kind === "staff" ? caller.uid : "";
  const by = caller.kind === "staff" ? caller.email || caller.uid : "";
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const ref = db.collection(kind.collection).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", `That ${kind.label} no longer exists.`);
    const current: Row = { ...snap.data(), id };
    if (current.voided === true) throw new HttpsError("failed-precondition", `This ${kind.label} is already voided.`);

    // A bill gives its month up, so a corrected bill can be recorded.
    const periodId = (SPECS[type] ?? ENTRIES[type])?.periodId;
    const claim = periodId ? await tx.get(db.doc(`unique_keys/${kind.collection}.period:${periodId(current)}`)) : null;

    const at = new Date().toISOString();
    const patch: Row = {
      voided: true,
      void_reason: reason,
      voided_at: at,
      voided_by_uid: uid,
      voided_by: by,
      updated_at: at,
      updated_by_uid: uid,
    };
    tx.update(ref, patch);
    if (claim?.exists && claim.get("doc_id") === id) tx.delete(claim.ref);
    return { ...current, ...patch };
  });
});
