import { getFirestore, type DocumentSnapshot } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { CASCADES } from "../cascade.js";
import { callerOf, requireRole } from "./caller.js";
import { record, requiredText } from "./validate.js";

/**
 * The records that hold official records — energy and water accounts and
 * their submeters, vehicles, violator profiles (approved 2026-10-20 / 21).
 *
 * Deleting one used to delete its bills, readings, purchases, trips or
 * tickets with it (cascadeDeletes). Now a holder is deleted only while it
 * holds nothing at all; one with any record — voided ones included — is
 * kept, and is archived instead (accounts and profiles) or set Inactive
 * (vehicles, which already had that status). Each deletion is checked in a
 * transaction, so a record saved at the same moment cannot be lost with it.
 * Deleting a holder also releases the claim on its unique value.
 */

type Row = Record<string, unknown>;

const HOLDERS: Record<string, { label: string; instead: string }> = {
  energy_accounts: { label: "account", instead: "Archive it instead." },
  water_accounts: { label: "account", instead: "Archive it instead." },
  energy_submeters: { label: "submeter", instead: "Set it Inactive instead." },
  water_submeters: { label: "submeter", instead: "Archive it instead." },
  fuel_vehicles: { label: "vehicle", instead: "Set it Inactive instead." },
  violators: { label: "profile", instead: "Archive it instead." },
};

/** Archivable holders: the ones with no status of their own for this. */
const ARCHIVABLE = ["energy_accounts", "water_accounts", "violators"];

const enc = (v: unknown) => String(v ?? "").replaceAll("/", "%2F");

/** The claim a holder holds (same keys as src/lib/firestore.ts claimKey and firestore.rules). */
function claimOf(collection: string, row: Row): string | null {
  switch (collection) {
    case "energy_accounts":
    case "water_accounts":
      return `${collection}.account_number:${enc(row.account_number)}`;
    case "fuel_vehicles":
      return `fuel_vehicles.plate_number:${enc(row.plate_number)}`;
    case "energy_submeters":
    case "water_submeters":
      return `${collection}.submeter_number:${String(row.account_id ?? "")}~${enc(row.submeter_number)}`;
    case "violators":
      return row.name_key ? `violators.name_key:${String(row.name_key).replaceAll("/", " ")}` : null;
    default:
      return null;
  }
}

const holderOf = (v: unknown) => {
  const collection = String(v ?? "");
  if (!HOLDERS[collection]) throw new HttpsError("invalid-argument", "These records cannot be deleted here.");
  return collection;
};

export const deleteRecordHolders = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "delete these records");
  const input = record(request.data ?? {});
  const collection = holderOf(input.collection);
  const ids = Array.isArray(input.ids) ? input.ids.map((v) => requiredText(v, "Record", 200)).slice(0, 200) : [];
  if (ids.length === 0) throw new HttpsError("invalid-argument", "Choose what to delete.");
  const { label, instead } = HOLDERS[collection];
  const db = getFirestore();

  const deleted: string[] = [];
  const kept: { id: string; name: string; reason: string }[] = [];
  for (const id of ids) {
    await db.runTransaction(async (tx) => {
      const ref = db.collection(collection).doc(id);
      const snap: DocumentSnapshot = await tx.get(ref);
      if (!snap.exists) return;
      const row: Row = { ...snap.data(), id };
      for (const child of CASCADES[collection] ?? []) {
        const any = await tx.get(db.collection(child.collection).where(child.field, "==", id).limit(1));
        if (!any.empty) {
          kept.push({
            id,
            name: String(row.account_number ?? row.plate_number ?? row.submeter_number ?? row.full_name ?? id),
            reason: `This ${label} holds official records, which are never deleted. ${instead}`,
          });
          return;
        }
      }
      const key = claimOf(collection, row);
      const claim = key ? await tx.get(db.doc(`unique_keys/${key}`)) : null;
      tx.delete(ref);
      if (claim?.exists && claim.get("doc_id") === id) tx.delete(claim.ref);
      deleted.push(id);
    });
  }
  return { deleted, kept };
});

/**
 * Archives an account or a violator profile — or restores it. Archiving
 * keeps the record and everything it holds exactly as it is; it marks the
 * record no longer in use, with who and when. What an archived record may
 * still receive (new bills, new tickets) is not decided yet and is not
 * restricted.
 */
export const setRecordHolderArchived = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "archive these records");
  const input = record(request.data ?? {});
  const collection = String(input.collection ?? "");
  if (!ARCHIVABLE.includes(collection)) throw new HttpsError("invalid-argument", "These records are not archived here.");
  const id = requiredText(input.id, "Record", 200);
  const archived = input.archived === true;
  const uid = caller.kind === "staff" ? caller.uid : "";
  const by = caller.kind === "staff" ? caller.email || caller.uid : "";
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = db.collection(collection).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That record no longer exists.");
    const at = new Date().toISOString();
    const patch: Row = archived
      ? { archived: true, archived_at: at, archived_by: by, archived_by_uid: uid }
      : { archived: false, archived_at: null, archived_by: null, archived_by_uid: null, restored_at: at, restored_by: by };
    tx.update(ref, { ...patch, updated_at: at, updated_by_uid: uid });
    return { ...snap.data(), id, ...patch, updated_at: at };
  });
});
