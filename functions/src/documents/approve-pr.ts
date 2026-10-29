import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { allocateDocumentNumber, manilaYear, readNumberingSettings } from "../numbering.js";
import { buildLinkedPO, claimExistingPO, findLinkedPO, readPOSettings, writeLinkedPO } from "./linked-po.js";
import { PR_DESIGNATIONS, PR_SIGNATORY_KEYS, settingId } from "./signatories.js";
import { callerOf } from "./caller.js";
import { record, requiredText, text } from "./validate.js";

/**
 * Approving a Purchase Request (21 Oct 2026). Approval is the authorised
 * stage at which the official document is completed, so it happens here, in
 * one transaction, rather than as a browser write:
 *
 *   - the request must be Submitted, with a purpose (the GSO completes it).
 *     The fund, section and FPP are optional (22 Oct 2026): a blank one
 *     prints as a ruled blank to be written in by hand;
 *   - the signatories for this document must be configured in Settings →
 *     Signatories: the requesting office's Requested-by signatory, Cash
 *     Availability and Approved by. Nothing is invented when one is missing:
 *     the approval is refused and says which;
 *   - the official PR number is assigned — PREFIX-YYYY-NNNNNN, a sequence of
 *     its own, separate from the PR-YYYY-NNNNNN tracking reference, restarting
 *     every Manila calendar year, never reused (a counter that only grows, and
 *     a unique_keys claim per number). The prefix comes from Settings →
 *     Procurement and is PROVISIONAL: "100" has not been confirmed as the
 *     municipality's official code;
 *   - the signatories' names and designations are copied onto the request,
 *     so a later change in Settings never alters an approved document.
 *
 * A request returned to draft and approved again keeps its official number
 * and its signatory copy: both are written once (firestore.rules keep them
 * from the browser too).
 *
 * Its Purchase Order is created in the same transaction (21 Oct 2026,
 * proposed single-approval workflow pending the municipality's
 * confirmation): approving the request authorizes the order — see
 * linked-po.ts. One order per request; approving again, a double click or a
 * retry returns the order already linked, never a second one.
 */

type Row = Record<string, unknown>;

/** Settings → Procurement: the provisional official prefix. */
const DEFAULT_PREFIX = "100";
/** Settings → Procurement prefix and the Purchase Request's three printed names. */
const SETTING_KEYS = {
  prefix: settingId("Procurement", "official_pr_prefix"),
  requestedBy: PR_SIGNATORY_KEYS.requestedBy,
  cashName: PR_SIGNATORY_KEYS.cashAvailability,
  approvedName: PR_SIGNATORY_KEYS.approvedBy,
};

export interface Signatory {
  name: string;
  designation: string;
}

export function formatOfficialNumber(prefix: string, year: number, sequence: number, padding: number, separator: string) {
  return [prefix, String(year), String(sequence).padStart(padding, "0")].join(separator);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const approvePurchaseRequest = onCall(async (request) => {
  const caller = await callerOf(request);
  if (
    caller.kind !== "staff" ||
    !(caller.role === "Administrator" || (caller.role === "Department User" && caller.approver))
  ) {
    throw new HttpsError("permission-denied", "You don't have permission to approve purchase requests.");
  }
  const input = record(request.data ?? {});
  const id = requiredText(input.id, "Purchase request", 40);
  const remarks = text(input.remarks, "Remarks", { max: 1000, optional: true })?.trim() || undefined;
  const numbering = await readNumberingSettings();
  const db = getFirestore();

  return db.runTransaction(
    async (tx) => {
      const ref = db.collection("purchase_requests").doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", `Purchase request ${id} was not found.`);
      const pr: Row = { ...snap.data(), id };
      // Already approved with its order (a double click, a retry, or a second
      // approver at the same moment): nothing more to do, the same order stands.
      if (pr.status === "Approved" && str(pr.po_number)) return pr;
      if (pr.status !== "Submitted") {
        throw new HttpsError("failed-precondition", `Only a submitted request can be approved; ${id} is ${String(pr.status)}.`);
      }
      if (!str(pr.purpose)) {
        throw new HttpsError("failed-precondition", `Add the purpose to ${id} before approving it.`);
      }

      const settings = Object.fromEntries(
        await Promise.all(
          Object.entries(SETTING_KEYS).map(async ([k, docId]) => {
            const s = await tx.get(db.collection("system_configuration").doc(docId));
            return [k, s.exists ? s.get("value") : undefined] as const;
          }),
        ),
      );

      // The signatories, unless an earlier approval already fixed them.
      let signatories = pr.signatories as Row | undefined;
      // The roles and designations are the form's; only the names are settings.
      // The official who signs "Requested by" is the General Services Officer,
      // whoever filed the request.
      if (!signatories) {
        const missing = [
          !str(settings.requestedBy) && "Requested by (General Services Officer)",
          !str(settings.cashName) && "Cash Availability (Municipal Treasurer)",
          !str(settings.approvedName) && "Approved by (Municipal Mayor)",
        ].filter(Boolean);
        if (missing.length) {
          throw new HttpsError(
            "failed-precondition",
            `Set the printed name for ${missing.join(", ")} in Settings → Purchase Request signatories before approving ${id}.`,
          );
        }
        signatories = {
          requested_by: { name: str(settings.requestedBy), designation: PR_DESIGNATIONS.requestedBy },
          cash_availability: { name: str(settings.cashName), designation: PR_DESIGNATIONS.cashAvailability },
          approved_by: { name: str(settings.approvedName), designation: PR_DESIGNATIONS.approvedBy },
        };
      }

      // The official number, unless an earlier approval already assigned it.
      const now = new Date();
      const at = now.toISOString();
      let officialNumber = str(pr.official_pr_number);
      let claimRef: DocumentReference | null = null;
      let counterRef: DocumentReference | null = null;
      let sequence = 0;
      const year = manilaYear(now);
      if (!officialNumber) {
        const prefix = str(settings.prefix) || DEFAULT_PREFIX;
        counterRef = db.collection("document_counters").doc(`PR-OFFICIAL-${year}`);
        const counter = await tx.get(counterRef);
        sequence = Number(counter.get("current_sequence") ?? 0);
        // Skip any number already claimed (e.g. a counter restored from an
        // older backup), so a number is never issued twice.
        for (let tries = 0; tries < 25; tries++) {
          sequence += 1;
          officialNumber = formatOfficialNumber(prefix, year, sequence, numbering.padding, numbering.separator);
          claimRef = db.doc(`unique_keys/purchase_requests.official_pr_number:${officialNumber.replaceAll("/", "%2F")}`);
          if (!(await tx.get(claimRef)).exists) break;
          claimRef = null;
        }
        if (!claimRef) throw new HttpsError("aborted", "Could not assign an official PR number. Try again.");
      }

      const by = caller.email || caller.uid;

      // The linked order: the one already linked, if the request had one, or a
      // new one. Its reads come before any write, and allocating its number
      // (which writes the PO counter) is the last read.
      const poSettings = await readPOSettings(tx);
      const linked = await findLinkedPO(tx, pr);
      let newPO: Row | null = null;
      let poNumber = linked;
      if (!poNumber) {
        poNumber = await allocateDocumentNumber(tx, "PO", year, numbering);
        newPO = buildLinkedPO({ ...pr, official_pr_number: officialNumber }, poNumber, now, { by, uid: caller.uid }, poSettings);
      }

      const patch: Row = {
        status: "Approved",
        approvals: [
          ...((pr.approvals as unknown[]) ?? []),
          // Firestore stores no undefined: remarks only when there are some.
          { step: "Approved", by, office: "General Services Office", at, ...(remarks ? { remarks } : {}), byUid: caller.uid },
        ],
        history: [
          ...((pr.history as unknown[]) ?? []),
          { id: crypto.randomUUID(), kind: "status", text: remarks ? `Status → Approved: ${remarks}` : "Status → Approved", at },
          ...(claimRef
            ? [{ id: crypto.randomUUID(), kind: "official-number", text: `Official PR No. ${officialNumber} assigned by ${by}`, at }]
            : []),
          newPO
            ? { id: crypto.randomUUID(), kind: "purchase-order", text: `Purchase order ${poNumber} created with this approval`, at }
            : { id: crypto.randomUUID(), kind: "purchase-order", text: `Linked to purchase order ${poNumber}`, at },
        ],
        signatories,
        po_number: poNumber,
        official_pr_number: officialNumber,
        ...(claimRef
          ? { official_pr_number_assigned_at: at, official_pr_number_assigned_by: by, official_pr_number_assigned_by_uid: caller.uid }
          : {}),
        updated_at: at,
        updated_by_uid: caller.uid,
      };
      if (counterRef && claimRef) {
        tx.set(counterRef, { document_type: "PR-OFFICIAL", year, current_sequence: sequence, updated_at: now });
        tx.set(claimRef, { collection: "purchase_requests", doc_id: id, created_at: at });
      }
      if (newPO) writeLinkedPO(tx, newPO);
      else claimExistingPO(tx, str(pr.pr_number) || id, poNumber, at);
      tx.update(ref, patch);
      return { ...pr, ...patch };
    },
    { maxAttempts: 10 },
  );
});
