import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf, requireRole } from "./caller.js";
import { record, requiredText } from "./validate.js";

/**
 * Removing synthetic purchase requests from the LOCAL DEMO (21 Oct 2026).
 *
 * This is test-data cleanup, not record management. Official purchase
 * requests are never deleted — they are voided (voidPurchaseRequest) — and
 * firestore.rules refuse every delete from a browser. This function works
 * only inside the Firebase Emulator Suite for the demo project; deployed to a
 * real project it refuses every call, so it can never remove an official
 * record.
 *
 * Administrators only. A request a purchase order or requisition slip was
 * raised from is left alone, whatever that document's status, so nothing is
 * left pointing at a missing request. Numbering is untouched: the counters
 * and the number claims stay, so a deleted request's numbers are never
 * issued again. The audit trail records each deletion (recordEvents).
 */

export const DEMO_PROJECT_ID = "demo-egso-prims";

/** True only inside the Functions emulator, for the demo project. */
export function demoCleanupAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.FUNCTIONS_EMULATOR === "true" && env.GCLOUD_PROJECT === DEMO_PROJECT_ID;
}

const MAX = 100;

export const deleteDemoPurchaseRequests = onCall(async (request) => {
  if (!demoCleanupAllowed(process.env)) {
    throw new HttpsError(
      "failed-precondition",
      "Purchase requests are never deleted. Deleting test data is available only in the local demo.",
    );
  }
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "delete demo purchase requests");
  const input = record(request.data ?? {});
  const raw = Array.isArray(input.ids) ? input.ids : [];
  if (raw.length === 0 || raw.length > MAX) {
    throw new HttpsError("invalid-argument", `Choose between 1 and ${MAX} purchase requests.`);
  }
  const ids = [...new Set(raw.map((v) => requiredText(v, "Purchase request", 40)))];
  const db = getFirestore();

  const deleted: string[] = [];
  const refused: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      await db.runTransaction(async (tx) => {
        const ref = db.collection("purchase_requests").doc(id);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", `${id} no longer exists.`);
        const number = String(snap.get("pr_number") ?? id);
        const [orders, slips] = await Promise.all([
          tx.get(db.collection("purchase_orders").where("pr_number", "==", number)),
          tx.get(db.collection("ris_requests").where("pr_number", "==", number)),
        ]);
        const linked = [
          ...orders.docs.map((d) => String(d.get("po_number") ?? d.id)),
          ...slips.docs.map((d) => String(d.get("ris_number") ?? d.id)),
        ];
        if (linked.length) {
          throw new HttpsError("failed-precondition", `${number} is kept: ${linked.join(", ")} ${linked.length === 1 ? "was" : "were"} raised from it.`);
        }
        tx.delete(ref);
      });
      deleted.push(id);
    } catch (e) {
      refused.push({ id, reason: e instanceof HttpsError ? e.message : "Could not be deleted." });
    }
  }
  return { deleted, refused };
});
