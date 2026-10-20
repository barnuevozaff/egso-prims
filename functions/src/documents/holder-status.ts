import { getFirestore, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Archived or inactive holders take no new records (approved 2026-10-21):
 * an archived energy or water account, an inactive (or archived) submeter or
 * one on an archived account, an inactive vehicle and an archived violator
 * profile refuse new bills, readings, trips, purchases and tickets until an
 * Administrator restores them. Their existing records stay, and can still be
 * corrected or voided.
 */

const LABEL: Record<string, string> = {
  energy_accounts: "energy account",
  water_accounts: "water account",
  energy_submeters: "submeter",
  water_submeters: "submeter",
  fuel_vehicles: "vehicle",
  violators: "violator profile",
};

const ACCOUNT_OF: Record<string, string> = {
  energy_submeters: "energy_accounts",
  water_submeters: "water_accounts",
};

/** Why a holder takes no new records, or null when it is open. */
export function closedReason(collection: string, data: Record<string, unknown>): string | null {
  const label = LABEL[collection] ?? "record";
  if (data.archived === true) {
    return `This ${label} is archived. An Administrator must restore it before new records can be added.`;
  }
  // Energy submeters and vehicles go Inactive; water submeters, Archived.
  if (collection in ACCOUNT_OF || collection === "fuel_vehicles") {
    const status = String(data.status ?? "Active");
    if (status !== "Active") {
      return `This ${label} is ${status.toLowerCase()}. Set it Active again before new records can be added.`;
    }
  }
  return null;
}

/**
 * Reads the holder (and, for a submeter, its account) inside `tx` and
 * refuses when either is gone or closed. Reads only — call it before any
 * write in the transaction.
 */
export async function requireOpenHolder(
  tx: Transaction,
  collection: string,
  id: string,
  missing: string,
): Promise<DocumentSnapshot> {
  const db = getFirestore();
  const snap = await tx.get(db.collection(collection).doc(id));
  if (!snap.exists) throw new HttpsError("failed-precondition", missing);
  const closed = closedReason(collection, snap.data() ?? {});
  if (closed) throw new HttpsError("failed-precondition", closed);
  const accounts = ACCOUNT_OF[collection];
  if (accounts) {
    const account = await tx.get(db.collection(accounts).doc(String(snap.get("account_id"))));
    if (account.exists) {
      const accountClosed = closedReason(accounts, account.data() ?? {});
      if (accountClosed) throw new HttpsError("failed-precondition", accountClosed);
    }
  }
  return snap;
}
