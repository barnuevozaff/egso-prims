import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { allocateDocumentNumber, manilaYear, readNumberingSettings } from "../numbering.js";
import { callerOf, requireRole } from "./caller.js";
import { buildLinkedPO, claimExistingPO, findLinkedPO, readPOSettings, writeLinkedPO } from "./linked-po.js";
import { record, requiredText } from "./validate.js";

/**
 * The order for a request approved before orders were created with the
 * approval (21 Oct 2026). Administrators only, and idempotent: if the request
 * already has an order — linked, claimed, or raised from it by hand earlier —
 * that order is linked and returned; only when there is none is one created,
 * once. Nothing on the request is rewritten except its link to the order.
 */

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const ensurePurchaseOrderForPR = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "create purchase orders for approved requests");
  const uid = caller.kind === "staff" ? caller.uid : "";
  const by = caller.kind === "staff" ? caller.email || caller.uid : "Administrator";
  const input = record(request.data ?? {});
  const id = requiredText(input.id, "Purchase request", 40);
  const numbering = await readNumberingSettings();
  const db = getFirestore();

  return db.runTransaction(
    async (tx) => {
      const ref = db.collection("purchase_requests").doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", `Purchase request ${id} was not found.`);
      const pr: Row = { ...snap.data(), id };
      if (pr.status !== "Approved" && pr.status !== "Completed") {
        throw new HttpsError(
          "failed-precondition",
          `${id} is ${String(pr.status)}. Its purchase order is created when it is approved.`,
        );
      }
      if (str(pr.po_number)) return { po_number: str(pr.po_number), created: false };

      const linked = await findLinkedPO(tx, pr);
      const now = new Date();
      const at = now.toISOString();
      if (linked) {
        claimExistingPO(tx, str(pr.pr_number) || id, linked, at);
        tx.update(ref, {
          po_number: linked,
          history: [
            ...((pr.history as unknown[]) ?? []),
            { id: crypto.randomUUID(), kind: "purchase-order", text: `Linked to purchase order ${linked}`, at, by },
          ],
          updated_at: at,
          updated_by_uid: uid,
        });
        return { po_number: linked, created: false };
      }

      const settings = await readPOSettings(tx);
      const poNumber = await allocateDocumentNumber(tx, "PO", manilaYear(now), numbering);
      const po = buildLinkedPO(pr, poNumber, now, { by, uid }, settings, "created afterwards for a request approved earlier");
      writeLinkedPO(tx, po);
      tx.update(ref, {
        po_number: poNumber,
        history: [
          ...((pr.history as unknown[]) ?? []),
          { id: crypto.randomUUID(), kind: "purchase-order", text: `Purchase order ${poNumber} created for this approved request`, at, by },
        ],
        updated_at: at,
        updated_by_uid: uid,
      });
      return { po_number: poNumber, created: true };
    },
    { maxAttempts: 10 },
  );
});
