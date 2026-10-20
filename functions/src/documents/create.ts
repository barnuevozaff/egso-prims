import { getFirestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

import { allocateDocumentNumber, manilaYear, readNumberingSettings } from "../numbering.js";
import {
  buildPurchaseOrder,
  buildPurchaseRequest,
  buildReservation,
  buildRisRequest,
  parsePurchaseRequest,
  parseReservation,
  type Row,
} from "./builders.js";
import { PUBLIC_CALLABLE, callerOf, canCreate, enforcePublicLimit, requireRole, type Caller } from "./caller.js";
import { BLOCKING_STATUSES, sameFacility, timesOverlap } from "./facilities.js";

/**
 * Creating a numbered document: the number is allocated and the document
 * written in one Firestore transaction. Either both happen or neither does,
 * so a number is spent only on a document that exists. Concurrent requests
 * queue on the counter (see numbering.ts) and never share a number.
 *
 * This replaces the browser calling next_document_number and then inserting
 * the row, where a failed insert spent the number for nothing.
 *
 * Remaining gap: a document can still be deleted later (the list pages offer
 * it). The audit trail records each deletion as Critical, with the number.
 */

async function createNumbered(options: {
  type: string;
  collection: string;
  caller: Caller;
  build: (number: string, at: string) => Row;
  /** Reads that must happen inside the transaction, before the number is taken. */
  before?: (tx: Transaction) => Promise<void>;
}): Promise<Row> {
  const db = getFirestore();
  const settings = await readNumberingSettings();
  const year = manilaYear(new Date());
  return db.runTransaction(
    async (tx) => {
      await options.before?.(tx);
      const number = await allocateDocumentNumber(tx, options.type, year, settings);
      const row = {
        ...options.build(number, new Date().toISOString()),
        // The staff account that raised the document. It owns it (a
        // Department User edits and voids only their own purchase requests,
        // firestore.rules), and the audit trail names it: this write is the
        // server's, so the trigger cannot see who asked for it. Portal
        // documents have no owner.
        // null marks a portal submission: the audit trail records it as the
        // public portal rather than guessing.
        created_by_uid: options.caller.kind === "staff" ? options.caller.uid : null,
      };
      tx.create(db.collection(options.collection).doc(number), row);
      return row;
    },
    { maxAttempts: 10 },
  );
}

/**
 * The public portal may file purchase requests, RIS and reservations, but
 * only as plain submissions: no attachments (the portal forms have none and
 * storage.rules would refuse the upload), no drafts, rate limited.
 */
async function admit(request: CallableRequest, what: string): Promise<Caller> {
  const caller = callerOf(request);
  if (caller.kind === "staff" && !canCreate(caller)) {
    throw new HttpsError("permission-denied", `Viewers cannot file ${what}.`);
  }
  if (caller.kind === "public") {
    await enforcePublicLimit(request, "submit");
    const raw = request.data?.input as { attachments?: unknown[] } | undefined;
    if (raw?.attachments?.length) {
      throw new HttpsError("permission-denied", "Attachments can be added by the General Services Office.");
    }
  }
  return caller;
}

export const createPurchaseRequest = onCall(PUBLIC_CALLABLE, async (request) => {
  const caller = await admit(request, "purchase requests");
  const input = request.data?.input;
  parsePurchaseRequest(input); // reject bad input before a number is taken
  return createNumbered({
    type: "PR",
    collection: "purchase_requests",
    caller,
    build: (number, at) => buildPurchaseRequest(input, number, at),
  });
});

export const createPurchaseOrder = onCall(async (request) => {
  const caller = callerOf(request);
  requireRole(caller, ["Administrator"], "raise purchase orders");
  const input = request.data?.input;
  const asDraft = request.data?.asDraft === true;
  buildPurchaseOrder(input, "PO-0000-000000", new Date().toISOString(), asDraft);
  return createNumbered({
    type: "PO",
    collection: "purchase_orders",
    caller,
    build: (number, at) => buildPurchaseOrder(input, number, at, asDraft),
  });
});

export const createRisRequest = onCall(PUBLIC_CALLABLE, async (request) => {
  const caller = await admit(request, "requisition slips");
  const input = request.data?.input;
  // Drafts are a staff convenience; a public slip is always submitted.
  const asDraft = caller.kind === "staff" && request.data?.asDraft === true;
  buildRisRequest(input, "RIS-0000-000000", new Date().toISOString(), asDraft);
  return createNumbered({
    type: "RIS",
    collection: "ris_requests",
    caller,
    build: (number, at) => buildRisRequest(input, number, at, asDraft),
  });
});

export const createReservation = onCall(PUBLIC_CALLABLE, async (request) => {
  const caller = await admit(request, "reservations");
  const input = request.data?.input;
  const wanted = parseReservation(input);
  const db = getFirestore();
  return createNumbered({
    type: "FR",
    collection: "reservations",
    caller,
    // Inside the transaction: two people booking the same slot at the same
    // moment cannot both pass this check. The browser-side check the
    // Supabase version made could be raced.
    before: async (tx) => {
      const sameDay = await tx.get(
        db
          .collection("reservations")
          .where("date", "==", wanted.date)
          .where("status", "in", [...BLOCKING_STATUSES]),
      );
      const conflicts = sameDay.docs.filter(
        (d) =>
          sameFacility(String(d.get("facility_id") ?? ""), wanted.facilityId) &&
          timesOverlap(wanted.startTime, wanted.endTime, String(d.get("start_time")), String(d.get("end_time"))),
      );
      if (conflicts.length > 0) {
        throw new HttpsError(
          "failed-precondition",
          `Schedule conflict with ${conflicts.map((d) => d.get("res_number")).join(", ")} — pick another slot.`,
        );
      }
    },
    build: (number, at) => buildReservation(input, number, at),
  });
});
