import { doc, orderBy, runTransaction, where, writeBatch, type QueryConstraint } from "firebase/firestore";

import { dateOnly } from "@/lib/db";
import {
  callFunction,
  fetchAllRows,
  firestore,
  friendlyFirebaseError,
  getRow,
  matchesSearch,
  updateRow,
  writerUid,
  type Row,
} from "@/lib/firestore";
import { removeAttachmentFile, uploadAttachmentInputs } from "@/lib/firebase-storage";
import {
  exportRequestsCsv,
  rowToRIS,
  type RISDraftInput,
  type StockSuggestion,
} from "@/features/ris/api.supabase";
import {
  VOIDABLE_RIS_STATUSES,
  type RISListFilters,
  type RISStatus,
  type RequestForIssuance,
} from "@/features/ris/types";

/**
 * RIS service — Firestore-backed. Same signatures as api.supabase.ts.
 *
 * Raising a slip goes through the createRisRequest Cloud Function (staff and
 * the public portal), which numbers and saves it in one transaction.
 * Releasing a slip is one transaction too: the stock deduction, the
 * stock-card lines and the slip's new status are written together, so a
 * shortfall leaves both the slip and the register untouched. (The Supabase
 * version deducted, then recorded the status, in separate writes.)
 */

export { exportRequestsCsv };

const TABLE = "ris_requests";
const SEARCH_FIELDS = ["ris_number", "pr_number", "po_number", "requester", "purpose", "department_code", "issued_by"];
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const notFound = (id: string) => `RIS not found: ${id}`;

function serverFilters(filters: RISListFilters): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (filters.departmentCode) c.push(where("department_code", "==", filters.departmentCode));
  if (filters.status) c.push(where("status", "==", filters.status));
  return c;
}

const newestFirst = (a: Row, b: Row) =>
  String(b.created_at).localeCompare(String(a.created_at)) ||
  String(b.ris_number).localeCompare(String(a.ris_number));

export async function listRequests(filters: RISListFilters = {}): Promise<RequestForIssuance[]> {
  const rows = await fetchAllRows(TABLE, [...serverFilters(filters), orderBy("created_at", "desc")]);
  const from = filters.dateFrom ? dateOnly(filters.dateFrom) : undefined;
  const to = filters.dateTo ? dateOnly(filters.dateTo) : undefined;
  return rows
    .filter(
      (r) =>
        (!from || r.issue_date >= from) &&
        (!to || r.issue_date <= to) &&
        matchesSearch(r, SEARCH_FIELDS, filters.search),
    )
    .sort(newestFirst)
    .map(rowToRIS);
}

export async function getRequest(id: string): Promise<RequestForIssuance | null> {
  const row = await getRow(TABLE, id);
  return row ? rowToRIS(row) : null;
}

export async function createRequest(
  input: RISDraftInput,
  options: { asDraft?: boolean } = {},
): Promise<RequestForIssuance> {
  const attachments = await uploadAttachmentInputs(input.attachments, `upload-${uid()}`);
  const row = await callFunction<Row>("createRisRequest", {
    input: { ...input, attachments },
    asDraft: options.asDraft === true,
  });
  return rowToRIS(row);
}

export async function updateRequest(id: string, input: RISDraftInput): Promise<RequestForIssuance> {
  const current = await getRequest(id);
  if (!current) throw new Error(notFound(id));
  const uploaded = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    current.risNumber,
  );
  const at = nowIso();
  return rowToRIS(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      pr_number: input.prNumber?.trim() || null,
      fund: input.fund?.trim() || null,
      division: input.division?.trim() || null,
      fpp_code: input.fppCode?.trim() || null,
      po_number: input.poNumber ?? null,
      department_code: input.departmentCode,
      requester: input.requester,
      purpose: input.purpose,
      received_by: input.receivedBy,
      items: input.items.map((it) => ({ ...it, id: uid() })),
      attachments: [...(r.attachments ?? []), ...uploaded.map((a) => ({ ...a, id: uid(), uploadedAt: at }))],
      history: [...(r.history ?? []), { id: uid(), kind: "update", text: "Slip details updated", at }],
      updated_at: at,
    })),
  );
}

export async function deleteRequests(ids: string[]): Promise<void> {
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

/**
 * Status changes that move no stock: submitting a draft, returning a slip
 * for revision, rejecting it (with the reason as remarks), and marking a
 * slip released under the earlier workflow Completed. Approval issues the
 * stock and goes through approveRequest (22 Oct 2026); there is no Release.
 */
export async function setRequestStatus(
  id: string,
  status: RISStatus,
  options: { by?: string; office?: string; remarks?: string } = {},
): Promise<RequestForIssuance> {
  if (status === "Approved" || status === "Released") {
    throw new Error("Approving a slip issues its stock; use Approve.");
  }
  try {
    return rowToRIS(
      await runTransaction(firestore(), async (tx) => {
        const ref = doc(firestore(), TABLE, id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(notFound(id));
        const current = rowToRIS({ ...snap.data(), id });
        const at = nowIso();
        const history = [...current.history];
        // Checked again inside the transaction, so two people cannot both act on it.
        if (status === "Rejected" && current.status !== "Pending Approval") {
          throw new Error(`${current.risNumber} is ${current.status}; only a pending slip can be rejected.`);
        }

        const patch = {
          status,
          approvals: [
            ...current.approvals,
            { step: status, by: options.by, office: options.office, at, remarks: options.remarks, byUid: writerUid() },
          ],
          history: [
            ...history,
            {
              id: uid(),
              kind: "status",
              text: options.remarks ? `Status → ${status}: ${options.remarks}` : `Status → ${status}`,
              at,
            },
          ],
          updated_at: at,
          updated_by_uid: writerUid(),
        };
        tx.update(ref, patch);
        return { ...snap.data(), id, ...patch };
      }),
    );
  } catch (e) {
    if (!(e as { code?: unknown })?.code) throw e;
    throw friendlyFirebaseError(e);
  }
}

/**
 * Approves a pending slip and issues its stock in one server transaction
 * (approveRisRequest, 22 Oct 2026): checks every line and the stock, deducts
 * it with stock-card lines, and stamps who approved it. Approving it again
 * changes nothing.
 */
export async function approveRequest(
  id: string,
  options: { by?: string; office?: string } = {},
): Promise<RequestForIssuance> {
  return rowToRIS(await callFunction<Row>("approveRisRequest", { id, by: options.by, office: options.office }));
}

/** Rejects a pending slip with a reason. No stock moves. */
export async function rejectRequest(
  id: string,
  input: { reason: string; by?: string; office?: string },
): Promise<RequestForIssuance> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for rejecting the slip.");
  return setRequestStatus(id, "Rejected", { by: input.by, office: input.office, remarks: reason });
}

/**
 * Voids a slip instead of deleting it (see api.supabase.ts). Before release
 * no stock has moved, so the status changes here, checked again inside the
 * transaction. A Released slip goes to the voidReleasedRis function, which
 * returns the stock its release took and closes the slip in one transaction
 * (Administrators only).
 */
export async function cancelRequest(
  id: string,
  input: { reason: string; by: string; office?: string },
): Promise<RequestForIssuance> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for voiding the slip.");
  const current = await getRequest(id);
  if (!current) throw new Error(notFound(id));
  // An issued slip gives its stock back as it is voided (voidReleasedRis).
  if (current.status === "Released" || (current.status === "Approved" && current.stockIssuedAt)) {
    return rowToRIS(await callFunction<Row>("voidReleasedRis", { id, reason, by: input.by, office: input.office }));
  }
  const at = nowIso();
  return rowToRIS(
    await updateRow(TABLE, id, notFound(id), (r) => {
      if (r.status === "Released" || r.stock_issued_at || !VOIDABLE_RIS_STATUSES.includes(r.status)) {
        throw new Error(`${r.ris_number} is ${r.status} and cannot be voided.`);
      }
      return {
        status: "Cancelled",
        approvals: [
          ...(r.approvals ?? []),
          { step: "Cancelled", by: input.by, office: input.office, at, remarks: reason, byUid: writerUid() },
        ],
        history: [...(r.history ?? []), { id: uid(), kind: "status", text: `Status → Cancelled: ${reason}`, at }],
        updated_at: at,
      };
    }),
  );
}

export async function addRequestComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<RequestForIssuance> {
  const at = nowIso();
  return rowToRIS(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      comments: [...(r.comments ?? []), { id: uid(), createdAt: at, ...input }],
      history: [...(r.history ?? []), { id: uid(), kind: "comment", text: `${input.author} commented`, at }],
      updated_at: at,
    })),
  );
}

export async function removeRequestAttachment(id: string, attachmentId: string): Promise<RequestForIssuance> {
  const current = await getRequest(id);
  if (!current) throw new Error(notFound(id));
  const removed = current.attachments.find((a) => a.id === attachmentId);
  if (removed?.path) await removeAttachmentFile(removed.path);
  const at = nowIso();
  return rowToRIS(
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

/**
 * The GSO stock list for the portal's RIS form, A to Z, from the
 * portalStockSuggestions Cloud Function: each item's ID and code, name, unit
 * and whether any is on hand — never the quantity. The form filters it as the
 * requester types (29 Oct 2026). A failure throws, so the form can say the
 * list did not load rather than that nothing matches.
 */
export async function listStock(): Promise<StockSuggestion[]> {
  const rows = await callFunction<{ id: string; code: string; name: string; unit: string; in_stock: boolean }[]>(
    "portalStockSuggestions",
    { query: "" },
  );
  return Array.isArray(rows)
    ? rows.map((r) => ({ id: r.id, code: r.code, name: r.name, unit: r.unit, inStock: r.in_stock }))
    : [];
}
