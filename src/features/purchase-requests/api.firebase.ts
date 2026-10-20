import { doc, orderBy, where, writeBatch, type QueryConstraint, type QueryDocumentSnapshot } from "firebase/firestore";

import { dateOnly } from "@/lib/db";
import {
  callFunction,
  fetchAllRows,
  fetchRowsPage,
  firestore,
  friendlyFirebaseError,
  getRow,
  matchesSearch,
  updateRow,
  type Row,
} from "@/lib/firestore";
import { removeAttachmentFile, uploadAttachmentInputs } from "@/lib/firebase-storage";
import { requireFirebase } from "@/lib/firebase";
import {
  exportPurchaseRequestsCsv,
  rowToPR,
  VOIDABLE_PR_STATUSES,
  type PRDraftInput,
} from "@/features/purchase-requests/api.supabase";
import type { PRListFilters, PRStatus, PurchaseRequest } from "@/features/purchase-requests/types";

/**
 * Purchase Request service — Firestore-backed. Same signatures as
 * api.supabase.ts; api.ts picks one (lib/data-backend.ts).
 *
 * Creating a request goes through the createPurchaseRequest Cloud Function,
 * which numbers and saves it in one transaction. Status changes are checked
 * by firestore.rules: only an Administrator or an approver may approve,
 * reject or return a request.
 */

export { exportPurchaseRequestsCsv, VOIDABLE_PR_STATUSES };

const TABLE = "purchase_requests";
const SEARCH_FIELDS = ["pr_number", "requester", "purpose", "department_code"];
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const notFound = (id: string) => `Purchase request not found: ${id}`;

/** Status and office are filtered by Firestore; see firestore.indexes.json. */
function serverFilters(filters: PRListFilters): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (filters.departmentCode) c.push(where("department_code", "==", filters.departmentCode));
  if (filters.status) c.push(where("status", "==", filters.status));
  return c;
}

/** Dates and the search box are applied to the loaded documents. */
function matchesLocally(r: Row, filters: PRListFilters): boolean {
  const from = filters.dateFrom ? dateOnly(filters.dateFrom) : undefined;
  const to = filters.dateTo ? dateOnly(filters.dateTo) : undefined;
  return (
    (!from || r.request_date >= from) &&
    (!to || r.request_date <= to) &&
    matchesSearch(r, SEARCH_FIELDS, filters.search)
  );
}

/** Newest first by when the record was raised; the number breaks ties. */
const newestFirst = (a: Row, b: Row) =>
  String(b.created_at).localeCompare(String(a.created_at)) ||
  String(b.pr_number).localeCompare(String(a.pr_number));

export async function listPurchaseRequests(filters: PRListFilters = {}): Promise<PurchaseRequest[]> {
  const rows = await fetchAllRows(TABLE, [...serverFilters(filters), orderBy("created_at", "desc")]);
  return rows.filter((r) => matchesLocally(r, filters)).sort(newestFirst).map(rowToPR);
}

/**
 * One page of the list, newest first, for screens that page rather than load
 * everything. The search box and dates filter within the page.
 */
export async function listPurchaseRequestsPage(
  filters: PRListFilters,
  pageSize: number,
  cursor?: QueryDocumentSnapshot,
): Promise<{ rows: PurchaseRequest[]; cursor?: QueryDocumentSnapshot }> {
  const page = await fetchRowsPage(
    TABLE,
    [...serverFilters(filters), orderBy("created_at", "desc")],
    pageSize,
    cursor,
  );
  return { rows: page.rows.filter((r) => matchesLocally(r, filters)).map(rowToPR), cursor: page.cursor };
}

export async function getPurchaseRequest(id: string): Promise<PurchaseRequest | null> {
  const row = await getRow(TABLE, id);
  return row ? rowToPR(row) : null;
}

export async function createPurchaseRequest(input: PRDraftInput): Promise<PurchaseRequest> {
  // The number does not exist until the function runs, so new files go
  // under an upload folder of their own.
  const attachments = await uploadAttachmentInputs(input.attachments, `upload-${uid()}`);
  const row = await callFunction<Row>("createPurchaseRequest", { input: { ...input, attachments } });
  return rowToPR(row);
}

export async function updatePurchaseRequest(id: string, input: PRDraftInput): Promise<PurchaseRequest> {
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error(notFound(id));
  const uploaded = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    current.prNumber,
  );
  const at = nowIso();
  return rowToPR(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      department_code: input.departmentCode,
      requester: input.requester,
      purpose: input.purpose,
      funding_source: input.fundingSource,
      request_date: input.requestDate,
      items: input.items.map((it) => ({ ...it, id: uid() })),
      attachments: [...(r.attachments ?? []), ...uploaded.map((a) => ({ ...a, id: uid(), uploadedAt: at }))],
      history: [...(r.history ?? []), { id: uid(), kind: "update", text: "Request details updated", at }],
      updated_at: at,
    })),
  );
}

export async function deletePurchaseRequests(ids: string[]): Promise<void> {
  try {
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(firestore());
      for (const id of ids.slice(i, i + 400)) batch.delete(doc(firestore(), TABLE, id));
      await batch.commit();
    }
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

/** The signed-in account, stamped on each approval step (firestore.rules check it). */
const actorUid = () => requireFirebase().auth.currentUser?.uid;

export async function setPurchaseRequestStatus(
  id: string,
  status: PRStatus,
  options: { by?: string; office?: string; remarks?: string } = {},
): Promise<PurchaseRequest> {
  const at = nowIso();
  return rowToPR(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      status,
      approvals: [
        ...(r.approvals ?? []),
        { step: status, by: options.by, office: options.office, at, remarks: options.remarks, byUid: actorUid() },
      ],
      history: [
        ...(r.history ?? []),
        {
          id: uid(),
          kind: "status",
          text: options.remarks ? `Status → ${status}: ${options.remarks}` : `Status → ${status}`,
          at,
        },
      ],
      updated_at: at,
    })),
  );
}

/**
 * Voids a purchase request instead of deleting it (see api.supabase.ts).
 * Checked again inside the transaction, so a request completed a moment ago
 * is not voided on stale information; firestore.rules require the reason
 * and that the step is signed by the account taking it.
 */
export async function cancelPurchaseRequest(
  id: string,
  input: { reason: string; by: string; office?: string },
): Promise<PurchaseRequest> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for voiding the request.");
  const at = nowIso();
  return rowToPR(
    await updateRow(TABLE, id, notFound(id), (r) => {
      if (!VOIDABLE_PR_STATUSES.includes(r.status)) {
        throw new Error(`${r.pr_number} is ${r.status} and cannot be voided.`);
      }
      return {
        status: "Cancelled",
        approvals: [
          ...(r.approvals ?? []),
          { step: "Cancelled", by: input.by, office: input.office, at, remarks: reason, byUid: actorUid() },
        ],
        history: [...(r.history ?? []), { id: uid(), kind: "status", text: `Status → Cancelled: ${reason}`, at }],
        updated_at: at,
      };
    }),
  );
}

export async function addPurchaseRequestComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<PurchaseRequest> {
  const at = nowIso();
  return rowToPR(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      comments: [...(r.comments ?? []), { id: uid(), createdAt: at, ...input }],
      history: [...(r.history ?? []), { id: uid(), kind: "comment", text: `${input.author} commented`, at }],
      updated_at: at,
    })),
  );
}

export async function removePurchaseRequestAttachment(
  id: string,
  attachmentId: string,
): Promise<PurchaseRequest> {
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error(notFound(id));
  const removed = current.attachments.find((a) => a.id === attachmentId);
  if (removed?.path) await removeAttachmentFile(removed.path);
  const at = nowIso();
  return rowToPR(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      attachments: (r.attachments ?? []).filter((a: { id: string }) => a.id !== attachmentId),
      history: [
        ...(r.history ?? []),
        { id: uid(), kind: "attachment", text: `Attachment removed${removed ? `: ${removed.name}` : ""}`, at },
      ],
      updated_at: at,
    })),
  );
}
