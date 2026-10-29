import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  startAfter,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { requireFirebase } from "@/lib/firebase";

/**
 * Firestore counterparts of the helpers in lib/db.ts, shared by every module's
 * api.firebase.ts. Documents keep the Supabase column names, so each module's
 * row mapper reads them unchanged.
 */

export type Row = DocumentData & { id: string };

export const firestore = (): Firestore => requireFirebase().db;

/**
 * Maps Firestore and Cloud Functions errors to the same friendly messages
 * friendlyDbError gives for Supabase. Functions already speak plainly
 * ("Schedule conflict with FR-2026-000004 …"), so their message is kept.
 */
export function friendlyFirebaseError(error: unknown): Error {
  const rawCode = String((error as { code?: unknown })?.code ?? "");
  const fromFunction = rawCode.startsWith("functions/");
  const code = rawCode.replace(/^functions\//, "");
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  switch (code) {
    case "permission-denied":
      // A function's refusal says why ("Viewers cannot file …"). Firestore's
      // says nothing useful, and the emulator's lists rule internals.
      return new Error(fromFunction && message ? message : "You don't have permission to perform this action.");
    case "unauthenticated":
      return new Error("Sign in again to continue.");
    case "unavailable":
      return new Error("Unable to reach the server. Check your connection and try again.");
    case "deadline-exceeded":
      return new Error("The server took too long to respond. Please try again.");
    case "already-exists":
      // "A bill for that account and billing period already exists."
      return new Error(fromFunction && message ? message : "A record with that identifier already exists.");
    case "invalid-argument":
    case "failed-precondition":
    case "not-found":
    case "resource-exhausted":
    case "aborted":
      return new Error(message);
    case "internal":
      // A function that failed, or one not deployed yet (Spark, 21 Oct 2026):
      // the browser sees only "internal". Never word it as if anything saved.
      if (fromFunction) {
        return new Error(
          "The server could not complete this action, so it was not recorded. The server functions may not be available yet; please try again later or tell the GSO administrator.",
        );
      }
      return new Error(`Database error: ${message}`);
    default:
      return new Error(`Database error: ${message}`);
  }
}

const withId = (snap: QueryDocumentSnapshot): Row => ({ ...snap.data(), id: snap.id });

/**
 * The signed-in account, stamped on every staff write as updated_by_uid (or
 * created_by_uid on a new record). firestore.rules require the stamp to be
 * the writer's own account, and the recordEvents function names it in the
 * audit trail — so the trail never depends on the trigger seeing who wrote,
 * which the emulator does not tell it.
 */
export const writerUid = (): string | null => requireFirebase().auth.currentUser?.uid ?? null;

/** The signed-in account's email, for records that name who acted (a cancelled ticket). */
export const writerEmail = (): string | null => requireFirebase().auth.currentUser?.email ?? null;

/** Firestore reads per page while walking a whole result set. */
const PAGE_SIZE = 500;

/**
 * Every document matching the constraints, read in pages (the Firestore
 * counterpart of fetchAll). `constraints` must include an orderBy so pages
 * follow one another.
 */
export async function fetchAllRows(
  collectionName: string,
  constraints: QueryConstraint[],
): Promise<Row[]> {
  try {
    const out: Row[] = [];
    let last: QueryDocumentSnapshot | undefined;
    for (;;) {
      const page = await getDocs(
        query(
          collection(firestore(), collectionName),
          ...constraints,
          ...(last ? [startAfter(last)] : []),
          limit(PAGE_SIZE),
        ),
      );
      out.push(...page.docs.map(withId));
      if (page.size < PAGE_SIZE) return out;
      last = page.docs[page.docs.length - 1];
    }
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

/**
 * One page of a list, for screens that page instead of loading everything.
 * Pass the returned cursor back to read the next page.
 */
export async function fetchRowsPage(
  collectionName: string,
  constraints: QueryConstraint[],
  pageSize: number,
  cursor?: QueryDocumentSnapshot,
): Promise<{ rows: Row[]; cursor?: QueryDocumentSnapshot }> {
  try {
    const page = await getDocs(
      query(
        collection(firestore(), collectionName),
        ...constraints,
        ...(cursor ? [startAfter(cursor)] : []),
        limit(pageSize),
      ),
    );
    return {
      rows: page.docs.map(withId),
      cursor: page.size === pageSize ? page.docs[page.docs.length - 1] : undefined,
    };
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

/** One document, or null when it does not exist or cannot be read. */
export async function getRow(collectionName: string, id: string): Promise<Row | null> {
  try {
    const snap = await getDoc(doc(firestore(), collectionName, id));
    return snap.exists() ? { ...snap.data(), id: snap.id } : null;
  } catch {
    // Same contract as the Supabase get functions: a failed read is "not found".
    return null;
  }
}

/**
 * Read-modify-write in one transaction, so two people appending a comment or
 * a history entry at the same moment cannot overwrite each other (the
 * Supabase version read, then wrote, and could). `build` must not have side
 * effects: Firestore retries it if the document changes underneath.
 */
export async function updateRow(
  collectionName: string,
  id: string,
  notFound: string,
  build: (current: Row) => Record<string, unknown>,
): Promise<Row> {
  try {
    return await runTransaction(firestore(), async (tx) => {
      const ref = doc(firestore(), collectionName, id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error(notFound);
      const current = { ...snap.data(), id: snap.id };
      const patch = { ...build(current), updated_by_uid: writerUid() };
      tx.update(ref, patch);
      return { ...current, ...patch };
    });
  } catch (e) {
    // Errors `build` throws ("already issued", "not found") are the module's
    // own wording; only Firestore's coded errors are translated.
    if (!(e as { code?: unknown })?.code) throw e;
    throw friendlyFirebaseError(e);
  }
}

/**
 * Every document whose fields equal the given values (undefined values are
 * ignored), sorted in the browser by `compare`. Equality filters alone need
 * no composite index — Firestore merges the single-field ones — which is
 * why the utility modules sort here instead of on the server.
 */
export async function listWhere(
  collectionName: string,
  equals: Record<string, unknown>,
  compare?: (a: Row, b: Row) => number,
): Promise<Row[]> {
  const filters = Object.entries(equals)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => where(k, "==", v));
  const rows = await fetchAllRows(collectionName, filters);
  return compare ? rows.sort(compare) : rows;
}

/** Compares rows field by field; prefix a field with "-" for descending. */
export const byFields =
  (...fields: string[]) =>
  (a: Row, b: Row): number => {
    for (const f of fields) {
      const desc = f.startsWith("-");
      const key = desc ? f.slice(1) : f;
      const x = a[key];
      const y = b[key];
      const c =
        typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  };

/**
 * Creates a document under a chosen id, refusing if one exists — the
 * Firestore counterpart of a primary-key or unique-period violation — and
 * stamps the writer (firestore.rules require it).
 */
export async function createRow(collectionName: string, row: Row, duplicate: string): Promise<Row> {
  const stamped = { ...row, created_by_uid: writerUid(), updated_by_uid: writerUid() };
  try {
    await runTransaction(firestore(), async (tx) => {
      const ref = doc(firestore(), collectionName, row.id);
      if ((await tx.get(ref)).exists()) throw new Error(duplicate);
      tx.set(ref, stamped);
    });
    return stamped;
  } catch (e) {
    if (!(e as { code?: unknown })?.code) throw e;
    throw friendlyFirebaseError(e);
  }
}

/** Deletes documents in batches. */
export async function deleteRows(collectionName: string, ids: string[]): Promise<void> {
  try {
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(firestore());
      for (const id of ids.slice(i, i + 400)) batch.delete(doc(firestore(), collectionName, id));
      await batch.commit();
    }
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

/**
 * Refuses a value another document already uses — the check a Postgres
 * unique index made. Checked before writing, so two administrators saving
 * the same value at the same instant could both pass; the database-level
 * guarantee exists only where a claim document or a deterministic id holds
 * the value (see docs/firebase/data-model.md).
 */
export async function assertUnique(
  collectionName: string,
  equals: Record<string, unknown>,
  exceptId: string | undefined,
  message: string,
): Promise<void> {
  const clash = (await listWhere(collectionName, equals)).find((r) => r.id !== exceptId);
  if (clash) throw new Error(message);
}

/**
 * A unique value's claim document: unique_keys/{collection}.{field}:{value}.
 * "/" cannot appear in a document ID, so it is written %2F (firestore.rules
 * builds the same key).
 */
export const claimKey = (collection: string, field: string, value: string) =>
  `${collection}.${field}:${value.replaceAll("/", "%2F")}`;

/**
 * Saves a document together with the claim on its unique value, in one
 * transaction — the Firestore counterpart of a Postgres unique index.
 * firestore.rules refuse the document unless it holds the claim, and refuse
 * a claim another live document holds, so two people saving the same value
 * at the same moment cannot both succeed: the second transaction re-reads
 * the claim and is refused.
 *
 * A claim left by a document that is gone, or that now has another value, is
 * stale and is taken over. Changing the value releases the old claim.
 */
export async function saveClaimedRow(options: {
  collection: string;
  id: string;
  isNew: boolean;
  fields: Record<string, unknown>;
  /** The claim key of a row's unique value. */
  keyOf: (row: Record<string, unknown>) => string;
  duplicate: string;
  notFound: string;
}): Promise<Row> {
  const { collection, id, isNew, fields, keyOf, duplicate, notFound } = options;
  const db = firestore();
  try {
    return await runTransaction(db, async (tx) => {
      const ref = doc(db, collection, id);
      const current = await tx.get(ref);
      if (isNew && current.exists()) throw new Error(duplicate);
      if (!isNew && !current.exists()) throw new Error(notFound);
      const row: Row = isNew
        ? { ...fields, id, created_by_uid: writerUid(), updated_by_uid: writerUid() }
        : { ...current.data(), ...fields, id, updated_by_uid: writerUid() };
      const key = keyOf(row);
      const claimRef = doc(db, "unique_keys", key);
      const claim = await tx.get(claimRef);
      const holderId = claim.exists() ? String(claim.get("doc_id")) : null;
      if (holderId && holderId !== id) {
        const holder = await tx.get(doc(db, collection, holderId));
        if (holder.exists() && keyOf({ ...holder.data(), id: holderId }) === key) throw new Error(duplicate);
      }
      const oldKey = current.exists() ? keyOf({ ...current.data(), id }) : null;
      const oldClaim = oldKey && oldKey !== key ? await tx.get(doc(db, "unique_keys", oldKey)) : null;

      if (isNew) tx.set(ref, row);
      else tx.update(ref, { ...fields, updated_by_uid: writerUid() });
      if (holderId !== id) tx.set(claimRef, { collection, doc_id: id, created_at: new Date().toISOString() });
      if (oldClaim?.exists() && oldClaim.get("doc_id") === id) tx.delete(oldClaim.ref);
      return row;
    });
  } catch (e) {
    if (!(e as { code?: unknown })?.code) throw e;
    throw friendlyFirebaseError(e);
  }
}

/** How many documents have one of the given statuses (one read per 1,000 matched). */
export async function countByStatus(
  collectionName: string,
  statuses?: readonly string[],
): Promise<number> {
  try {
    const base = collection(firestore(), collectionName);
    const q = statuses?.length ? query(base, where("status", "in", [...statuses])) : base;
    return (await getCountFromServer(q)).data().count;
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

/**
 * The browser-side counterpart of searchOr(): Firestore has no substring
 * search, so lists filter the documents they loaded. Same normalisation —
 * commas become spaces, % is dropped — and the same case-insensitive match.
 */
export function matchesSearch(row: Row, fields: string[], q: string | undefined): boolean {
  const needle = (q ?? "").replaceAll(",", " ").replaceAll("%", "").trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => String(row[f] ?? "").toLowerCase().includes(needle));
}

/** Calls a Cloud Function, mapping its errors to friendly messages. */
export async function callFunction<T>(name: string, data: unknown): Promise<T> {
  try {
    const fn = httpsCallable<unknown, T>(requireFirebase().functions, name);
    return (await fn(data)).data;
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}
