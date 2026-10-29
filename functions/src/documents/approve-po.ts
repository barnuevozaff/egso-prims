import { randomUUID } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { NUMBERING_TIME_ZONE } from "../numbering.js";
import { callerOf, requireRole } from "./caller.js";
import { readSourcePR } from "./po-source.js";
import { PO_DESIGNATIONS, PO_SIGNATORY_KEYS } from "./signatories.js";
import { record, requiredText, text } from "./validate.js";

/**
 * Approving a Purchase Order (21 Oct 2026). Approval completes the official
 * order, so it happens here, in one transaction, rather than as a browser
 * write:
 *
 *   - Administrators only, and only an order Pending Approval;
 *   - the source request must still be approved (not voided since);
 *   - the order needs a supplier, a place of delivery and at least one item;
 *   - the approving signatory must be set in Settings → Purchase Order
 *     signatories. Nothing is invented: approval is refused until it is;
 *   - the signatories are copied onto the order, so a later change in
 *     Settings never alters an approved document, and the PO date is set to
 *     the day of approval (Manila time).
 *
 * Approved is the order's final status in the ordinary workflow: it does not
 * record that anything was delivered, inspected or accepted (that is the
 * separate Acceptance and Inspection Report).
 *
 * An order returned to draft and approved again keeps its first signatory
 * copy and PO date (firestore.rules keep them from the browser too).
 */

type Row = Record<string, unknown>;

const SETTING_KEYS = {
  approvedName: PO_SIGNATORY_KEYS.approvedBy,
  bacName: PO_SIGNATORY_KEYS.bacSecretary,
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** YYYY-MM-DD in Manila, where the order is dated. */
export const manilaDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: NUMBERING_TIME_ZONE }).format(d);

export const approvePurchaseOrder = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "approve purchase orders");
  const uid = caller.kind === "staff" ? caller.uid : "";
  const input = record(request.data ?? {});
  const id = requiredText(input.id, "Purchase order", 40);
  const remarks = text(input.remarks, "Remarks", { max: 1000, optional: true })?.trim() || undefined;
  const by =
    text(input.by, "Name", { max: 200, optional: true })?.trim() ||
    (caller.kind === "staff" ? caller.email || caller.uid : "Administrator");
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const ref = db.collection("purchase_orders").doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", `Purchase order ${id} was not found.`);
    const po: Row = { ...snap.data(), id };
    const number = String(po.po_number ?? id);
    if (po.status !== "Pending Approval") {
      throw new HttpsError(
        "failed-precondition",
        `Only an order pending approval can be approved; ${number} is ${String(po.status)}.`,
      );
    }
    const missing = [
      !str(po.supplier_name) && "the supplier",
      !str(po.delivery_address) && "the place of delivery",
      !(Array.isArray(po.items) && po.items.length > 0) && "at least one item",
    ].filter(Boolean);
    if (missing.length) {
      throw new HttpsError("failed-precondition", `Add ${missing.join(", ")} to ${number} before approving it.`);
    }
    await readSourcePR(tx, String(po.pr_number ?? ""));

    // The signatories, unless an earlier approval already fixed them.
    let signatories = po.signatories as Row | undefined;
    if (!signatories) {
      const settings = Object.fromEntries(
        await Promise.all(
          Object.entries(SETTING_KEYS).map(async ([k, docId]) => {
            const s = await tx.get(db.collection("system_configuration").doc(docId));
            return [k, s.exists ? s.get("value") : undefined] as const;
          }),
        ),
      );
      if (!str(settings.approvedName)) {
        throw new HttpsError(
          "failed-precondition",
          `Set the approving signatory in Settings → Purchase Order signatories before approving ${number}.`,
        );
      }
      signatories = {
        approved_by: {
          name: str(settings.approvedName),
          designation: PO_DESIGNATIONS.approvedBy,
        },
        // Signs only the negotiated-purchase portion; left blank when not set.
        bac_secretary: str(settings.bacName)
          ? { name: str(settings.bacName), designation: PO_DESIGNATIONS.bacSecretary }
          : null,
      };
    }

    const now = new Date();
    const at = now.toISOString();
    const patch: Row = {
      status: "Approved",
      signatories,
      po_date: str(po.po_date) || manilaDate(now),
      approved_at: at,
      approved_by: by,
      approved_by_uid: uid,
      approvals: [
        ...((po.approvals as unknown[]) ?? []),
        // Firestore stores no undefined: remarks only when there are some.
        { step: "Approved", by, office: "General Services Office", at, ...(remarks ? { remarks } : {}), byUid: uid },
      ],
      history: [
        ...((po.history as unknown[]) ?? []),
        { id: randomUUID(), kind: "status", text: remarks ? `Status → Approved: ${remarks}` : "Status → Approved", at, by },
      ],
      updated_at: at,
      updated_by_uid: uid,
    };
    tx.update(ref, patch);
    return { ...po, ...patch };
  });
});
