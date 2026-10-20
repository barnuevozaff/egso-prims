import { randomUUID } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf, requireRole } from "./caller.js";
import { requireOpenHolder } from "./holder-status.js";
import { checked, checks, readPeriod, type Check } from "./numbered-records.js";

/**
 * The unnumbered utility entries — submeter bills (energy and water), water
 * meter readings and odometer readings — are saved here, in one transaction
 * with the checks that cannot be made from the browser (approved
 * 2026-10-21):
 *
 *   - the submeter (and its account) or the vehicle must be open: archived
 *     or inactive holders take no new records until restored;
 *   - one active submeter bill per submeter and month. A voided bill gives
 *     its month up (utility-records.ts), so its replacement can be saved.
 *
 * Like the bills, these entries are then corrected with a reason or voided,
 * never edited in place or deleted (firestore.rules). Administrators only.
 */

type Row = Record<string, unknown>;
const { str, optStr, num, date, month, year } = checks;
const pad2 = (n: unknown) => String(n).padStart(2, "0");

interface Entry {
  collection: string;
  fields: Record<string, Check>;
  parent: (r: Row) => { collection: string; id: string; missing: string };
  /** The month the entry stands for, when only one active entry may hold it. */
  periodId?: (r: Row) => string;
  /** An id for an entry without a period. */
  idFor: (r: Row) => string;
  derive?: (r: Row) => Row;
  guard?: (r: Row) => string | null;
  duplicate: string;
}

const SUBMETER_BILL = { consumption: num, amount: num, remarks: optStr };

export const ENTRIES: Record<string, Entry> = {
  ESB: {
    collection: "energy_submeter_bills",
    fields: { submeter_id: str, billing_month: month, billing_year: year, ...SUBMETER_BILL },
    parent: (r) => ({ collection: "energy_submeters", id: String(r.submeter_id), missing: "That submeter no longer exists." }),
    // The ID the browser used to give it, so older bills keep their month.
    periodId: (r) => `esb-${r.submeter_id}-${r.billing_year}-${pad2(r.billing_month)}`,
    idFor: (r) => `esb-${r.submeter_id}-${r.billing_year}-${pad2(r.billing_month)}`,
    duplicate: "A bill for that submeter and billing period already exists.",
  },
  WSB: {
    collection: "water_submeter_bills",
    fields: { submeter_id: str, billing_month: month, billing_year: year, ...SUBMETER_BILL },
    parent: (r) => ({ collection: "water_submeters", id: String(r.submeter_id), missing: "That submeter no longer exists." }),
    periodId: (r) => `wsb-${r.submeter_id}-${r.billing_year}-${pad2(r.billing_month)}`,
    idFor: (r) => `wsb-${r.submeter_id}-${r.billing_year}-${pad2(r.billing_month)}`,
    duplicate: "A bill for that submeter and billing period already exists.",
  },
  WMR: {
    collection: "water_meter_readings",
    fields: { submeter_id: str, reading_date: date, previous_reading: num, current_reading: num, amount: num, remarks: optStr },
    parent: (r) => ({ collection: "water_submeters", id: String(r.submeter_id), missing: "That submeter no longer exists." }),
    idFor: (r) => `wmr-${r.submeter_id}-${randomUUID()}`,
    derive: (r) => ({ consumption: Number(r.current_reading) - Number(r.previous_reading) }),
    guard: (r) =>
      Number(r.current_reading) < Number(r.previous_reading) ? "The current reading cannot be lower than the previous reading." : null,
    duplicate: "That reading already exists.",
  },
  ODO: {
    collection: "fuel_odometer_readings",
    fields: {
      vehicle_id: str,
      reading_date: date,
      previous_odometer: num,
      current_odometer: num,
      fuel_cost: num,
      fuel_liters: num,
      remarks: optStr,
    },
    parent: (r) => ({ collection: "fuel_vehicles", id: String(r.vehicle_id), missing: "That vehicle no longer exists." }),
    idFor: (r) => `fod-${r.vehicle_id}-${randomUUID()}`,
    derive: (r) => ({ distance: Number(r.current_odometer) - Number(r.previous_odometer) }),
    guard: (r) =>
      Number(r.current_odometer) < Number(r.previous_odometer)
        ? "The current odometer cannot be lower than the previous reading."
        : null,
    duplicate: "That reading already exists.",
  },
};

export const createUtilityEntry = onCall(async (request) => {
  const caller = callerOf(request);
  requireRole(caller, ["Administrator"], "record this");
  const type = String(request.data?.type ?? "");
  const entry = ENTRIES[type];
  if (!entry) throw new HttpsError("invalid-argument", "Unknown record type.");
  const fields = checked(request.data?.record, entry.fields);
  const refused = entry.guard?.(fields);
  if (refused) throw new HttpsError("invalid-argument", refused);
  const uid = caller.kind === "staff" ? caller.uid : "";
  const db = getFirestore();

  return db.runTransaction(
    async (tx) => {
      const parent = entry.parent(fields);
      await requireOpenHolder(tx, parent.collection, parent.id, parent.missing);
      const period = entry.periodId
        ? { id: entry.periodId(fields), ...(await readPeriod(tx, entry.collection, entry.periodId(fields), entry.duplicate)) }
        : null;
      const id = period ? (period.periodFree ? period.id : `${period.id}-${randomUUID().slice(0, 8)}`) : entry.idFor(fields);
      const at = new Date().toISOString();
      const row: Row = {
        id,
        ...fields,
        ...entry.derive?.(fields),
        created_at: at,
        updated_at: at,
        created_by_uid: uid,
      };
      tx.create(db.collection(entry.collection).doc(id), row);
      if (period) tx.set(period.claimRef, { collection: entry.collection, doc_id: id, created_at: at });
      return row;
    },
    { maxAttempts: 10 },
  );
});
