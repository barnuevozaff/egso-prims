import { getFirestore, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf } from "./documents/caller.js";

/**
 * Document numbers — PR-2026-000243 — ported from the Postgres function
 * next_document_number (migrations 032 and 035).
 *
 * Carried over unchanged:
 *   - format  TYPE{sep}YEAR{sep}SEQUENCE, sequence left-padded with zeros
 *   - padding, separator and the yearly reset come from system_configuration
 *     (category "Document Numbering"), defaulting to 6, "-" and true
 *   - with the yearly reset on, each year starts at 1; with it off, the
 *     sequence keeps counting across years (stored under year 0) and opens
 *     above the highest number ever issued, so no number is reused
 *   - the public portal never allocates a number on its own: PR, RIS and FR
 *     are numbered by the functions that create them (documents/create.ts)
 *
 * Changed from the SQL:
 *   - the year is the calendar year in Asia/Manila. Postgres used UTC, so a
 *     document filed between 00:00 and 08:00 on 1 January got last year's
 *     number.
 *   - with the yearly reset on, the next number continues after the highest
 *     number already printed with this year — this year's counter, plus the
 *     year-0 counter only if it issued numbers this year. The SQL compared
 *     against every year's counter, so the second number of a new year jumped
 *     past the whole previous year (PR-2027-000001, then PR-2027-000901).
 *     Migration 032 states the intended rule; this is that rule.
 *   - numbers that are document IDs (PR, PO, RIS, FR) skip any number a
 *     document already uses, so a counter that fell behind imported data
 *     cannot hand out a duplicate.
 *
 * Not guaranteed: gap-free numbering. A number is spent when the transaction
 * commits; if the browser then fails to save the document, that number is
 * never used. Closing that gap means creating the document in the same
 * transaction as the number (a callable that saves the record), which is a
 * Phase 3 decision.
 *
 * Counters live in document_counters/{TYPE}-{keyYear}; only these functions
 * touch them (firestore.rules gives browsers no access).
 */

export interface NumberingSettings {
  padding: number;
  separator: string;
  yearReset: boolean;
}

export const DEFAULT_SETTINGS: NumberingSettings = { padding: 6, separator: "-", yearReset: true };

/** Types whose number is the document ID of their collection. */
export const NUMBERED_COLLECTIONS: Record<string, string> = {
  PR: "purchase_requests",
  PO: "purchase_orders",
  RIS: "ris_requests",
  FR: "reservations",
};

/**
 * Types numbered by the function that saves them (numbered-records.ts,
 * records/documents.ts). Handing one out on its own would only leave a gap.
 */
// INV: inventory item codes, issued only with the item (documents/inventory.ts).
export const SAVED_WITH_NUMBER = ["EC", "WC", "FC", "VT", "RDS", "RIA", "RAD", "INV"];

/** How far past a taken number the allocator looks before giving up. */
const MAX_SKIPS = 25;

export const NUMBERING_TIME_ZONE = "Asia/Manila";

/** The calendar year in Manila at `date`. */
export function manilaYear(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: NUMBERING_TIME_ZONE, year: "numeric" }).format(date),
  );
}

export interface Counter {
  /** The counter's key: a calendar year, or 0 for the continuous sequence. */
  year: number;
  currentSequence: number;
  /**
   * The year printed on the last number this counter issued. Only matters for
   * the year-0 counter. Unknown on counters migrated without it, which are
   * treated as possibly having issued numbers this year.
   */
  lastYear?: number;
}

/** The next sequence for a type, given every counter that type already has. */
export function nextSequence(counters: Counter[], year: number, yearReset: boolean): {
  keyYear: number;
  sequence: number;
} {
  if (!yearReset) {
    // Continuous: above the highest number this type has ever reached.
    const maxAll = counters.reduce((m, c) => Math.max(m, c.currentSequence), 0);
    return { keyYear: 0, sequence: maxAll + 1 };
  }
  // Yearly: above the highest number already printed with this year. The
  // year-0 counter printed this year's numbers only if the reset was switched
  // off at some point this year.
  const thisYear = counters.find((c) => c.year === year)?.currentSequence ?? 0;
  const continuous = counters.find((c) => c.year === 0);
  const continuousThisYear =
    continuous && (continuous.lastYear === undefined || continuous.lastYear === year)
      ? continuous.currentSequence
      : 0;
  return { keyYear: year, sequence: Math.max(thisYear, continuousThisYear) + 1 };
}

export function formatDocumentNumber(
  type: string,
  year: number,
  sequence: number,
  { padding, separator }: Pick<NumberingSettings, "padding" | "separator">,
): string {
  return [type.toUpperCase(), String(year), String(sequence).padStart(padding, "0")].join(separator);
}

/** Settings values were jsonb in Postgres; accept both raw and JSON-encoded forms. */
export function parseSettings(rows: { key: string; value: unknown }[]): NumberingSettings {
  const read = (key: string) => {
    const raw = rows.find((r) => r.key === key)?.value;
    if (typeof raw !== "string") return raw;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  };
  const padding = Number(read("padding_length"));
  const separator = read("separator");
  const yearReset = read("year_reset");
  return {
    padding: Number.isInteger(padding) && padding > 0 ? padding : DEFAULT_SETTINGS.padding,
    separator: typeof separator === "string" ? separator : DEFAULT_SETTINGS.separator,
    yearReset: typeof yearReset === "boolean" ? yearReset : DEFAULT_SETTINGS.yearReset,
  };
}

/**
 * Numbering settings. Read outside the allocation transaction: they change
 * rarely, and keeping them out of it keeps the lock to the counter documents
 * alone, which is what lets many people file at the same moment.
 */
export async function readNumberingSettings(): Promise<NumberingSettings> {
  const snap = await getFirestore()
    .collection("system_configuration")
    .where("category", "==", "Document Numbering")
    .get();
  return parseSettings(snap.docs.map((d) => ({ key: String(d.get("key")), value: d.get("value") })));
}

const toCounter = (d: DocumentSnapshot): Counter => ({
  year: Number(d.get("year")),
  currentSequence: Number(d.get("current_sequence")),
  lastYear: d.get("last_year") === undefined ? undefined : Number(d.get("last_year")),
});

/** Allocates the next number inside the caller's transaction. */
export async function allocateDocumentNumber(
  tx: Transaction,
  type: string,
  year = manilaYear(new Date()),
  settings?: NumberingSettings,
  /**
   * For documents whose ID is not their number (Records Management): whether
   * a number is already held, so a counter behind imported data cannot hand
   * it out again. Read inside the transaction, before any write.
   */
  isTaken?: (number: string) => Promise<boolean>,
): Promise<string> {
  const db = getFirestore();
  const upper = type.toUpperCase();
  settings ??= await readNumberingSettings();

  // With the yearly reset on, only this year's counter and the continuous one
  // matter, so lock just those two documents. The continuous sequence needs
  // the highest number of every year, which only a query over the type gives.
  const counterDocs = settings.yearReset
    ? (await tx.getAll(
        db.doc(`document_counters/${upper}-${year}`),
        db.doc(`document_counters/${upper}-0`),
      )).filter((d) => d.exists)
    : (await tx.get(db.collection("document_counters").where("document_type", "==", upper))).docs;
  const counters = counterDocs.map(toCounter);

  const next = nextSequence(counters, year, settings.yearReset);
  let sequence = next.sequence;
  let number = formatDocumentNumber(upper, year, sequence, settings);

  const collection = NUMBERED_COLLECTIONS[upper];
  const taken =
    isTaken ??
    (collection ? async (n: string) => (await tx.get(db.collection(collection).doc(n))).exists : undefined);
  if (taken) {
    for (let skips = 0; await taken(number); skips++) {
      if (skips >= MAX_SKIPS) {
        throw new HttpsError(
          "failed-precondition",
          `${upper} numbering is behind the saved records near ${number}. Ask an administrator to check the counter.`,
        );
      }
      sequence += 1;
      number = formatDocumentNumber(upper, year, sequence, settings);
    }
  }

  tx.set(db.collection("document_counters").doc(`${upper}-${next.keyYear}`), {
    document_type: upper,
    year: next.keyYear,
    current_sequence: sequence,
    last_year: year,
    updated_at: new Date(),
  });
  return number;
}

/**
 * Callable replacement for supabase.rpc("next_document_number", { p_type }),
 * for the modules that still save their record in a separate step (energy,
 * water, fuel, violations, Records). Staff only: the public portal's
 * documents are numbered by the functions that create them
 * (documents/create.ts), so there is no public endpoint that only spends
 * numbers.
 */
export const nextDocumentNumber = onCall(async (request) => {
  const type = String((request.data as { type?: unknown } | null)?.type ?? "").toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(type)) {
    throw new HttpsError("invalid-argument", "Document type must be 2 to 5 letters, e.g. PR.");
  }
  // Any account, checked live like every function's caller (29 Oct 2026).
  if ((await callerOf(request)).kind !== "staff") {
    throw new HttpsError("permission-denied", "Only staff can allocate document numbers.");
  }
  if (type in NUMBERED_COLLECTIONS || SAVED_WITH_NUMBER.includes(type)) {
    throw new HttpsError(
      "failed-precondition",
      `${type} numbers are allocated when the document is created, not separately.`,
    );
  }
  const settings = await readNumberingSettings();
  const year = manilaYear(new Date());
  // Simultaneous requests for the same type queue on one counter document;
  // extra attempts let a burst of portal submissions all get a number.
  const number = await getFirestore().runTransaction(
    (tx) => allocateDocumentNumber(tx, type, year, settings),
    { maxAttempts: 10 },
  );
  return { number };
});
