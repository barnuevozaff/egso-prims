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
import { readSourcePR, type SourcePR } from "./po-source.js";
import { sourceClaim } from "./linked-po.js";
import { record, requiredText } from "./validate.js";

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
  /** Further writes in the same transaction, after the document's own. */
  after?: (tx: Transaction, row: Row) => void;
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
      options.after?.(tx, row);
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
  const caller = await callerOf(request);
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
    build: (number, at) => buildPurchaseRequest(input, number, at, { headings: caller.kind === "staff" }),
  });
});

export const createPurchaseOrder = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "raise purchase orders");
  const input = request.data?.input;
  const asDraft = request.data?.asDraft === true;
  // Reject bad input before a number is taken. The office, requester and
  // purpose come from the request, so they are not asked of the caller here.
  buildPurchaseOrder(input, "PO-0000-000000", new Date().toISOString(), asDraft, {
    department_code: "-",
    requester: "-",
    purpose: "-",
    official_pr_number: null,
  });
  const prNumber = requiredText(record(input).prNumber, "Purchase request", 40).trim();
  // Only from an approved request, read in the same transaction (21 Oct 2026).
  let source: SourcePR | undefined;
  return createNumbered({
    type: "PO",
    collection: "purchase_orders",
    caller,
    before: async (tx) => {
      source = await readSourcePR(tx, prNumber);
      // One order per request (21 Oct 2026): approving a request creates its
      // order, so this older route refuses a request that already has one.
      const claim = await tx.get(sourceClaim(prNumber));
      const existing = source.po_number || (claim.exists ? String(claim.get("doc_id")) : "");
      if (existing) {
        throw new HttpsError("failed-precondition", `${prNumber} already has purchase order ${existing}.`);
      }
    },
    build: (number, at) => buildPurchaseOrder(input, number, at, asDraft, source),
    after: (tx, row) => {
      tx.create(sourceClaim(prNumber), { collection: "purchase_orders", doc_id: row.po_number, created_at: row.created_at });
      tx.update(getFirestore().collection("purchase_requests").doc(prNumber), { po_number: row.po_number });
    },
  });
});

export const createRisRequest = onCall(PUBLIC_CALLABLE, async (request) => {
  const caller = await admit(request, "requisition slips");
  const input = request.data?.input;
  // Drafts are a staff convenience; a public slip is always submitted.
  const asDraft = caller.kind === "staff" && request.data?.asDraft === true;
  const checked = buildRisRequest(input, "RIS-0000-000000", new Date().toISOString(), asDraft);

  // Items come from the Inventory catalog (22 Oct 2026). A portal slip names
  // only register items; staff may still type one the register lacks, which
  // must be linked before release. A linked line takes its name, unit and
  // code from the register, whatever the browser sent. Filing never creates
  // an item or moves stock.
  const lines = checked.items as { inventoryItemId?: string }[];
  if (caller.kind === "public" && lines.some((it) => !it.inventoryItemId)) {
    throw new HttpsError("invalid-argument", "Choose each item from the GSO stock list.");
  }
  const catalog = new Map<string, { name: string; unit: string; code: string }>();
  return createNumbered({
    type: "RIS",
    collection: "ris_requests",
    caller,
    before: async (tx) => {
      const db = getFirestore();
      for (const [i, it] of lines.entries()) {
        if (!it.inventoryItemId || catalog.has(it.inventoryItemId)) continue;
        const snap = await tx.get(db.collection("inventory_items").doc(it.inventoryItemId));
        if (!snap.exists) {
          throw new HttpsError("failed-precondition", `Item ${i + 1} is no longer on the GSO stock list. Choose it again.`);
        }
        catalog.set(snap.id, {
          name: String(snap.get("name") ?? ""),
          unit: String(snap.get("unit") ?? ""),
          code: String(snap.get("item_code") ?? ""),
        });
      }
    },
    build: (number, at) => {
      const row = buildRisRequest(input, number, at, asDraft);
      row.items = (row.items as Record<string, unknown>[]).map((it) => {
        const c = typeof it.inventoryItemId === "string" ? catalog.get(it.inventoryItemId) : undefined;
        return c ? { ...it, name: c.name || it.name, unit: c.unit || it.unit, stockNo: c.code || null } : it;
      });
      return row;
    },
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
