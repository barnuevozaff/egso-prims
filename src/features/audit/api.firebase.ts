import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
  type QueryConstraint,
} from "firebase/firestore";

import { isoDate } from "@/lib/db";
import { requireFirebase } from "@/lib/firebase";
import { fetchAllRows, firestore, friendlyFirebaseError, getRow, matchesSearch, type Row } from "@/lib/firestore";
import { exportAuditCsv, rowToEntry } from "@/features/audit/api.supabase";
import type { AuditEntry, AuditListFilters } from "@/features/audit/types";

/**
 * Audit service — Firestore-backed. Same signatures as api.supabase.ts.
 *
 * The trail is append-only: entries are written by the recordEvents Cloud
 * Function, and firestore.rules let no one edit or delete one. The only
 * change allowed is adding a comment, one at a time, signed by the account
 * adding it (author_uid), which is how the comment shows who wrote it.
 */

export { exportAuditCsv };

const TABLE = "audit_logs";
const SEARCH_FIELDS = ["id", "user_name", "email", "module", "action", "document_number", "response", "remarks", "ip"];

function serverFilters(filters: AuditListFilters): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (filters.user) c.push(where("user_name", "==", filters.user));
  if (filters.departmentCode) c.push(where("department_code", "==", filters.departmentCode));
  if (filters.module) c.push(where("module", "==", filters.module));
  if (filters.action) c.push(where("action", "==", filters.action));
  if (filters.severity) c.push(where("severity", "==", filters.severity));
  // Timestamps are ISO strings, so the range is a plain string comparison.
  if (filters.dateFrom) c.push(where("timestamp", ">=", isoDate(filters.dateFrom)));
  if (filters.dateTo) c.push(where("timestamp", "<=", isoDate(filters.dateTo, true)));
  return c;
}

export async function listAuditEntries(filters: AuditListFilters = {}): Promise<AuditEntry[]> {
  const base = [...serverFilters(filters), orderBy("timestamp", "desc")];
  const searched = (rows: Row[]) => rows.filter((r) => matchesSearch(r, SEARCH_FIELDS, filters.search)).map(rowToEntry);
  if (filters.limit && !filters.search?.trim()) {
    try {
      const snap = await getDocs(query(collection(firestore(), TABLE), ...base, limit(filters.limit)));
      return snap.docs.map((d) => rowToEntry({ ...d.data(), id: d.id }));
    } catch (e) {
      throw friendlyFirebaseError(e);
    }
  }
  const rows = searched(await fetchAllRows(TABLE, base));
  return filters.limit ? rows.slice(0, filters.limit) : rows;
}

export async function getAuditEntry(id: string): Promise<AuditEntry | null> {
  const row = await getRow(TABLE, id);
  return row ? rowToEntry(row) : null;
}

/** Entries touching the same document (workflow trail). */
export async function listRelatedEntries(entry: AuditEntry): Promise<AuditEntry[]> {
  if (!entry.documentNumber) return [];
  return (
    await fetchAllRows(TABLE, [where("document_number", "==", entry.documentNumber), orderBy("timestamp", "asc")])
  ).map(rowToEntry);
}

/** Entries from the same login session. */
export async function listSessionEntries(entry: AuditEntry): Promise<AuditEntry[]> {
  return (
    await fetchAllRows(TABLE, [where("session_id", "==", entry.sessionId), orderBy("timestamp", "desc")])
  ).map(rowToEntry);
}

/**
 * Appends one comment, signed by the signed-in account: firestore.rules
 * accept the change only if author_uid is that account and every earlier
 * comment is untouched. Done in a transaction, so two reviewers commenting
 * at once are both kept.
 */
export async function addAuditComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<AuditEntry> {
  const authorUid = requireFirebase().auth.currentUser?.uid;
  if (!authorUid) throw new Error("Sign in again to comment.");
  try {
    return rowToEntry(
      await runTransaction(firestore(), async (tx) => {
        const ref = doc(firestore(), TABLE, id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(`Audit entry not found: ${id}`);
        const comments = [
          ...((snap.get("comments") as unknown[]) ?? []),
          { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...input, author_uid: authorUid },
        ];
        tx.update(ref, { comments });
        return { ...snap.data(), id, comments };
      }),
    );
  } catch (e) {
    if (!(e as { code?: unknown })?.code) throw e;
    throw friendlyFirebaseError(e);
  }
}

/** The trail is append-only on Firestore; no screen deletes entries. */
export async function deleteAuditEntries(ids: string[]): Promise<void> {
  throw new Error(`Audit entries cannot be deleted (${ids.length} selected).`);
}
