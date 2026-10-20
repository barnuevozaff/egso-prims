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
import { deductStockInTransaction } from "@/features/inventory/api.firebase";
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
 * Status transition. Releasing deducts inventory and writes stock-card lines
 * in the same transaction as the status; a shortfall aborts all of it.
 */
export async function setRequestStatus(
  id: string,
  status: RISStatus,
  options: { by?: string; office?: string; remarks?: string } = {},
): Promise<RequestForIssuance> {
  try {
    return rowToRIS(
      await runTransaction(firestore(), async (tx) => {
        const ref = doc(firestore(), TABLE, id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(notFound(id));
        const current = rowToRIS({ ...snap.data(), id });
        const at = nowIso();
        const history = [...current.history];

        if (status === "Released") {
          // Lines that name an item outside the register have nothing to deduct.
          const entries = await deductStockInTransaction(
            tx,
            current.items
              .filter((it) => !!it.inventoryItemId)
              .map((it) => ({ itemId: it.inventoryItemId!, quantity: it.issuedQty })),
            { documentNumber: current.risNumber, user: options.by ?? "Administrator" },
          );
          for (const e of entries) {
            history.push({
              id: uid(),
              kind: "update",
              text: `Stock card: ${e.itemName} −${e.quantityOut} (balance ${e.balance})`,
              at: e.date,
            });
          }
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
  if (current.status === "Released") {
    return rowToRIS(await callFunction<Row>("voidReleasedRis", { id, reason, by: input.by, office: input.office }));
  }
  const at = nowIso();
  return rowToRIS(
    await updateRow(TABLE, id, notFound(id), (r) => {
      if (r.status === "Released" || !VOIDABLE_RIS_STATUSES.includes(r.status)) {
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
 * Stock suggestions for the portal's RIS form, from the portalStockSuggestions
 * Cloud Function (name, unit and whether any is on hand — nothing else of the
 * register). Any failure returns no suggestions: they are a help, and the
 * form works without them.
 */
export async function suggestStock(query: string): Promise<StockSuggestion[]> {
  if (query.trim().length < 2) return [];
  try {
    const rows = await callFunction<{ name: string; unit: string; in_stock: boolean }[]>(
      "portalStockSuggestions",
      { query: query.trim() },
    );
    return Array.isArray(rows) ? rows.map((r) => ({ name: r.name, unit: r.unit, inStock: r.in_stock })) : [];
  } catch {
    return [];
  }
}
