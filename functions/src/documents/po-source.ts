import { getFirestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * The approved Purchase Request a Purchase Order is raised from (21 Oct 2026).
 *
 * Read inside the order's own transaction, both when the order is created and
 * when it is approved, so an order is never raised from — or approved against
 * — a request that is not approved, or was voided in the meantime. The
 * office, requester and purpose come from the request itself rather than
 * being typed again, and the request's official PR number is kept for the
 * printed "PR No./s".
 */

export interface SourcePR {
  department_code: string;
  requester: string;
  purpose: string;
  official_pr_number: string | null;
  /** The order already linked to the request, if any (21 Oct 2026). */
  po_number: string | null;
}

/** Statuses a request may be ordered from (canRaisePO in the app). */
export const ORDERABLE_PR_STATUSES = ["Approved", "Completed"];

export async function readSourcePR(tx: Transaction, prNumber: string): Promise<SourcePR> {
  const snap = await tx.get(getFirestore().collection("purchase_requests").doc(prNumber));
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", `Purchase request ${prNumber} was not found.`);
  }
  const status = String(snap.get("status"));
  if (!ORDERABLE_PR_STATUSES.includes(status)) {
    throw new HttpsError(
      "failed-precondition",
      `${prNumber} is ${status}. A purchase order is raised only from an approved purchase request.`,
    );
  }
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    department_code: text(snap.get("department_code")),
    requester: text(snap.get("requester")),
    purpose: text(snap.get("purpose")),
    official_pr_number: text(snap.get("official_pr_number")) || null,
    po_number: text(snap.get("po_number")) || null,
  };
}
