import { doc, runTransaction } from "firebase/firestore";

import {
  byFields,
  callFunction,
  firestore,
  friendlyFirebaseError,
  getRow,
  listWhere,
  matchesSearch,
  updateRow,
  writerEmail,
  writerUid,
  type Row,
} from "@/lib/firestore";
import {
  rowToViolation,
  rowToViolator,
  type PaymentInput,
  type RecordViolationInput,
  type ViolationInput,
  type ViolatorInput,
} from "@/features/violations/api.supabase";
import { normalizeName } from "@/features/violations/lib";
import { deleteHolders, setArchived } from "@/features/shared/record-holders";

import type { PaymentStatus, Violation, Violator } from "@/features/violations/types";

export { exportViolationsCsv, exportViolatorsCsv } from "@/features/violations/api.supabase";

/**
 * Violation Management service — Firestore-backed. Same signatures as
 * api.supabase.ts.
 *
 * One profile per person: Postgres held a unique index on name_key (the
 * normalised name). Here each profile claims its key in
 * unique_keys/violators.name_key:{key}, written in the same transaction, and
 * firestore.rules refuse a profile whose key is not claimed by it. Tickets
 * are numbered (VT) and saved by Cloud Functions — recordViolation finds or
 * opens the profile in the same transaction as the ticket.
 */

const VIOLATORS = "violators";
const VIOLATIONS = "violations";
const nowIso = () => new Date().toISOString();

const DUPLICATE_PROFILE = "A violator profile with that name already exists.";

const claimId = (key: string) => `violators.name_key:${key.replaceAll("/", " ")}`;

/* ---------------- violator profiles ---------------- */

export async function listViolators(search?: string): Promise<Violator[]> {
  return (await listWhere(VIOLATORS, {}, byFields("full_name")))
    .filter((r) => matchesSearch(r, ["full_name", "contact_number", "address"], search))
    .map(rowToViolator);
}

export async function getViolator(id: string): Promise<Violator | null> {
  const row = await getRow(VIOLATORS, id);
  return row ? rowToViolator(row) : null;
}

const profileFields = (input: ViolatorInput) => ({
  full_name: input.fullName.trim(),
  name_key: normalizeName(input.fullName),
  contact_number: input.contactNumber?.trim() || null,
  email: input.email?.trim() || null,
  address: input.address?.trim() || null,
});

/**
 * Writes a profile and claims its name key in one transaction. A claim left
 * by a profile that is gone, or that has since been renamed, is taken over;
 * a claim another live profile holds refuses the save.
 */
async function saveProfile(id: string, fields: Record<string, unknown>, isNew: boolean): Promise<Row> {
  const key = String(fields.name_key);
  if (!key) throw new Error("Enter the violator's name.");
  const db = firestore();
  try {
    return await runTransaction(db, async (tx) => {
      const ref = doc(db, VIOLATORS, id);
      const claimRef = doc(db, "unique_keys", claimId(key));
      const current = await tx.get(ref);
      if (isNew && current.exists()) throw new Error(DUPLICATE_PROFILE);
      if (!isNew && !current.exists()) throw new Error(`Violator not found: ${id}`);
      const claim = await tx.get(claimRef);
      const holderId = claim.exists() ? String(claim.get("doc_id")) : null;
      if (holderId && holderId !== id) {
        const holder = await tx.get(doc(db, VIOLATORS, holderId));
        if (holder.exists() && holder.get("name_key") === key) throw new Error(DUPLICATE_PROFILE);
      }
      const oldKey = current.exists() ? String(current.get("name_key") ?? "") : "";
      const row: Row = isNew
        ? { ...fields, id, created_by_uid: writerUid(), updated_by_uid: writerUid() }
        : { ...current.data(), ...fields, id, updated_by_uid: writerUid() };
      if (isNew) tx.set(ref, row);
      else tx.update(ref, { ...fields, updated_by_uid: writerUid() });
      if (holderId !== id) tx.set(claimRef, { collection: VIOLATORS, doc_id: id, created_at: nowIso() });
      // A renamed profile releases the key it held.
      if (oldKey && oldKey !== key) tx.delete(doc(db, "unique_keys", claimId(oldKey)));
      return row;
    });
  } catch (e) {
    if (!(e as { code?: unknown })?.code) throw e;
    throw friendlyFirebaseError(e);
  }
}

export async function createViolator(input: ViolatorInput): Promise<Violator> {
  const at = nowIso();
  return rowToViolator(
    await saveProfile(`vlt-${crypto.randomUUID()}`, { ...profileFields(input), created_at: at, updated_at: at }, true),
  );
}

export async function updateViolator(id: string, input: ViolatorInput): Promise<Violator> {
  return rowToViolator(await saveProfile(id, { ...profileFields(input), updated_at: nowIso() }, false));
}

/**
 * Deletes profiles that hold no tickets; a profile with tickets is kept
 * (official records are never deleted) — archive it instead.
 */
export async function deleteViolators(ids: string[]): Promise<void> {
  await deleteHolders(VIOLATORS, ids);
}

/** Archives or restores a profile; its tickets and history stay as they are. */
export async function archiveViolator(id: string, archived: boolean): Promise<Violator> {
  return rowToViolator(await setArchived(VIOLATORS, id, archived));
}

/**
 * The profile for a typed name, matched on the normalised key rather than the
 * displayed string — "NASOL, RICHARD" finds "Nasol, Richard".
 */
export async function findViolatorByName(name: string): Promise<Violator | null> {
  const key = normalizeName(name);
  if (!key) return null;
  try {
    const [row] = await listWhere(VIOLATORS, { name_key: key });
    return row ? rowToViolator(row) : null;
  } catch {
    return null;
  }
}

/**
 * The module's primary action: record a violation against a name. The
 * recordViolation function finds or opens the profile and numbers the ticket
 * in one transaction, so a failed ticket leaves no empty profile behind.
 */
export async function recordViolation(input: RecordViolationInput): Promise<{
  violation: Violation;
  violator: Violator;
  createdProfile: boolean;
}> {
  const name = input.violatorName.trim();
  if (!name) throw new Error("Enter the violator's name.");
  if (input.amount <= 0) throw new Error("The assessed amount must be more than ₱0.");
  const result = await callFunction<{ violation: Row; violator: Row; createdProfile: boolean }>("recordViolation", {
    violatorName: name,
    record: ticketFields(input),
  });
  return {
    violation: rowToViolation(result.violation),
    violator: rowToViolator(result.violator),
    createdProfile: result.createdProfile,
  };
}

/* ---------------- violations ---------------- */

export async function listViolations(violatorId?: string): Promise<Violation[]> {
  return (await listWhere(VIOLATIONS, { violator_id: violatorId }, byFields("-date_issued"))).map(rowToViolation);
}

const ticketFields = (input: ViolationInput) => ({
  violation_type: input.violationType,
  description: input.description?.trim() || null,
  date_issued: input.dateIssued,
  amount: input.amount,
  remarks: input.remarks?.trim() || null,
  apprehended_by: input.apprehendedBy?.trim() || null,
  citation_no: input.citationNo?.trim() || null,
});

/**
 * Records a violation against an existing profile. New violations always
 * start unsettled — the function sets Pending, ₱0 paid, the full amount
 * outstanding.
 */
export async function createViolation(violatorId: string, input: ViolationInput): Promise<Violation> {
  if (input.amount <= 0) throw new Error("The assessed amount must be more than ₱0.");
  const row = await callFunction<Row>("createNumberedRecord", {
    type: "VT",
    record: { violator_id: violatorId, ...ticketFields(input) },
  });
  return rowToViolation(row);
}

/** Corrects the particulars of a violation. Payment fields are untouched. */
export async function updateViolation(id: string, input: ViolationInput): Promise<Violation> {
  if (input.amount <= 0) throw new Error("The assessed amount must be more than ₱0.");
  return rowToViolation(
    await updateRow(VIOLATIONS, id, `Violation not found: ${id}`, (current) => {
      if (current.payment_status === "Paid" && input.amount !== Number(current.amount)) {
        throw new Error("A settled violation's assessed amount can no longer be changed.");
      }
      return {
        ...ticketFields(input),
        // Generated in Postgres (migration 029).
        outstanding_balance: input.amount - Number(current.amount_paid ?? 0),
        updated_at: nowIso(),
      };
    }),
  );
}

export async function getViolation(id: string): Promise<Violation | null> {
  const row = await getRow(VIOLATIONS, id);
  return row ? rowToViolation(row) : null;
}

/**
 * Settles a violation. Full payment only, so the outstanding balance always
 * lands on ₱0. Checked inside the transaction, so a violation cancelled or
 * paid a moment ago is not paid again.
 */
export async function recordPayment(id: string, input: PaymentInput): Promise<Violation> {
  return rowToViolation(
    await updateRow(VIOLATIONS, id, `Violation not found: ${id}`, (current) => {
      const amount = Number(current.amount ?? 0);
      if (current.payment_status === "Paid") throw new Error("This violation is already settled.");
      if (current.payment_status === "Cancelled") throw new Error("A cancelled violation cannot take a payment.");
      if (!input.paymentDate) throw new Error("Select the payment date.");
      if (!input.orNumber?.trim()) throw new Error("Enter the receipt/OR number.");
      if (input.amountPaid > amount) throw new Error("The payment cannot be more than the assessed amount.");
      if (input.amountPaid !== amount) {
        throw new Error("Record the full assessed amount — partial payments are not accepted.");
      }
      return {
        payment_status: "Paid" as PaymentStatus,
        payment_date: input.paymentDate,
        or_number: input.orNumber.trim(),
        amount_paid: amount,
        outstanding_balance: 0,
        payment_method: input.paymentMethod?.trim() || null,
        payment_remarks: input.remarks?.trim() || null,
        updated_at: nowIso(),
      };
    }),
  );
}

/**
 * Cancels an unsettled ticket, keeping it on the record with its reason,
 * the account that cancelled it and the time (approved 2026-10-21).
 */
export async function cancelViolation(id: string, reason: string): Promise<Violation> {
  const text = reason.trim();
  if (!text) throw new Error("Give a reason for cancelling the ticket.");
  return rowToViolation(
    await updateRow(VIOLATIONS, id, `Violation not found: ${id}`, (current) => {
      if (current.payment_status === "Paid") throw new Error("A settled violation can no longer be cancelled.");
      if (current.payment_status === "Cancelled") throw new Error("This ticket is already cancelled.");
      const at = nowIso();
      return {
        payment_status: "Cancelled" as PaymentStatus,
        payment_date: null,
        or_number: null,
        amount_paid: 0,
        outstanding_balance: Number(current.amount ?? 0),
        cancel_reason: text,
        cancelled_at: at,
        cancelled_by_uid: writerUid(),
        cancelled_by: writerEmail(),
        updated_at: at,
      };
    }),
  );
}

/** Numbered tickets are cancelled with a reason, never deleted (approved 2026-10-21). */
export async function deleteViolations(_ids: string[]): Promise<void> {
  throw new Error("Tickets are cancelled with a reason, not deleted.");
}
