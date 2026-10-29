import { randomUUID } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf, requireRole } from "./caller.js";
import { record, requiredText, text } from "./validate.js";

/**
 * Voids a Purchase Request (21 Oct 2026). A purchase request is numbered from
 * the moment it is filed, so it is never deleted: it is closed as Cancelled,
 * keeping its tracking reference, any official PR number, its items, history
 * and audit trail. The reason, the Administrator and the time go on the
 * approval timeline.
 *
 * Administrators only, and only while the request is open (Draft, Submitted
 * or Approved). A request that a purchase order or a requisition slip was
 * raised from is not voided while that document is still in force: void the
 * order or slip first. The check and the write happen in one transaction.
 * Browsers cannot void a request themselves (firestore.rules).
 */

type Row = Record<string, unknown>;

/** Open stages a request may be voided from (VOIDABLE_PR_STATUSES in the app). */
const VOIDABLE = ["Draft", "Submitted", "Approved"];

export const voidPurchaseRequest = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "void purchase requests");
  const uid = caller.kind === "staff" ? caller.uid : "";
  const input = record(request.data ?? {});
  const id = requiredText(input.id, "Purchase request", 40);
  const reason = requiredText(input.reason, "Reason", 500).trim();
  if (!reason) throw new HttpsError("invalid-argument", "Give a reason for voiding the request.");
  const by =
    text(input.by, "Name", { max: 200, optional: true })?.trim() ||
    (caller.kind === "staff" ? caller.email || caller.uid : "Administrator");
  const office = text(input.office, "Office", { max: 200, optional: true })?.trim() || null;
  const db = getFirestore();
  const ref = db.collection("purchase_requests").doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", `Purchase request ${id} was not found.`);
    const pr: Row = { ...snap.data(), id };
    const number = String(pr.pr_number ?? id);
    if (!VOIDABLE.includes(String(pr.status))) {
      throw new HttpsError("failed-precondition", `${number} is ${String(pr.status)} and cannot be voided.`);
    }

    // Documents raised from this request that are still in force.
    const [orders, slips] = await Promise.all([
      tx.get(db.collection("purchase_orders").where("pr_number", "==", number)),
      tx.get(db.collection("ris_requests").where("pr_number", "==", number)),
    ]);
    const linked = [
      ...orders.docs.filter((d) => d.get("status") !== "Cancelled").map((d) => String(d.get("po_number") ?? d.id)),
      ...slips.docs.filter((d) => d.get("status") !== "Cancelled").map((d) => String(d.get("ris_number") ?? d.id)),
    ];
    if (linked.length) {
      throw new HttpsError(
        "failed-precondition",
        `${number} cannot be voided while ${linked.join(", ")} ${linked.length === 1 ? "is" : "are"} in force. Void ${linked.length === 1 ? "it" : "them"} first.`,
      );
    }

    const at = new Date().toISOString();
    const patch: Row = {
      status: "Cancelled",
      approvals: [
        ...((pr.approvals as unknown[]) ?? []),
        { step: "Cancelled", by, office, at, remarks: reason, byUid: uid },
      ],
      history: [
        ...((pr.history as unknown[]) ?? []),
        { id: randomUUID(), kind: "status", text: `Status → Cancelled: ${reason}`, at, by },
      ],
      updated_at: at,
      updated_by_uid: uid,
    };
    tx.update(ref, patch);
    return { ...pr, ...patch };
  });
});
