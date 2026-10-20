import { doc, orderBy, where, writeBatch, type QueryConstraint } from "firebase/firestore";

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
  exportPurchaseOrdersCsv,
  rowToPO,
  type PODraftInput,
} from "@/features/purchase-orders/api.supabase";
import {
  canVoidPO,
  poSupplierName,
  type POListFilters,
  type POStatus,
  type PurchaseOrder,
} from "@/features/purchase-orders/types";

/**
 * Purchase Order service — Firestore-backed. Same signatures as
 * api.supabase.ts. Raising an order goes through the createPurchaseOrder
 * Cloud Function (Administrators only), which numbers and saves it in one
 * transaction.
 */

export { exportPurchaseOrdersCsv };

const TABLE = "purchase_orders";
const SEARCH_FIELDS = ["po_number", "pr_number", "requester", "purpose", "department_code"];
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const notFound = (id: string) => `Purchase order not found: ${id}`;

function serverFilters(filters: POListFilters): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (filters.departmentCode) c.push(where("department_code", "==", filters.departmentCode));
  if (filters.supplierName) c.push(where("supplier_name", "==", filters.supplierName));
  if (filters.status) c.push(where("status", "==", filters.status));
  return c;
}

const newestFirst = (a: Row, b: Row) =>
  String(b.created_at).localeCompare(String(a.created_at)) ||
  String(b.po_number).localeCompare(String(a.po_number));

export async function listPurchaseOrders(filters: POListFilters = {}): Promise<PurchaseOrder[]> {
  const rows = await fetchAllRows(TABLE, [...serverFilters(filters), orderBy("created_at", "desc")]);
  const from = filters.dateFrom ? dateOnly(filters.dateFrom) : undefined;
  const to = filters.dateTo ? dateOnly(filters.dateTo) : undefined;
  return rows
    .filter(
      (r) =>
        (!from || r.issued_date >= from) &&
        (!to || r.issued_date <= to) &&
        matchesSearch(r, SEARCH_FIELDS, filters.search),
    )
    .sort(newestFirst)
    .map(rowToPO);
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  const row = await getRow(TABLE, id);
  return row ? rowToPO(row) : null;
}

export async function createPurchaseOrder(
  input: PODraftInput,
  options: { asDraft?: boolean } = {},
): Promise<PurchaseOrder> {
  const attachments = await uploadAttachmentInputs(input.attachments, `upload-${uid()}`);
  const row = await callFunction<Row>("createPurchaseOrder", {
    input: { ...input, attachments },
    asDraft: options.asDraft === true,
  });
  return rowToPO(row);
}

export async function updatePurchaseOrder(id: string, input: PODraftInput): Promise<PurchaseOrder> {
  const current = await getPurchaseOrder(id);
  if (!current) throw new Error(notFound(id));
  const uploaded = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    current.poNumber,
  );
  const at = nowIso();
  return rowToPO(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      pr_number: input.prNumber,
      department_code: input.departmentCode,
      requester: input.requester,
      purpose: input.purpose,
      supplier_name: input.supplierName,
      supplier_address: input.supplierAddress?.trim() || null,
      supplier_tin: input.supplierTin?.trim() || null,
      supplier_contact: input.supplierContact?.trim() || null,
      mode_of_procurement: input.modeOfProcurement?.trim() || null,
      payment_term: input.paymentTerm?.trim() || null,
      delivery_term: input.deliveryTerm?.trim() || null,
      municipal_mayor: input.municipalMayor?.trim() || null,
      bac_secretary: input.bacSecretary?.trim() || null,
      delivery_address: input.deliveryAddress,
      expected_delivery: input.expectedDelivery,
      items: input.items.map((it) => ({ ...it, id: uid() })),
      attachments: [...(r.attachments ?? []), ...uploaded.map((a) => ({ ...a, id: uid(), uploadedAt: at }))],
      history: [...(r.history ?? []), { id: uid(), kind: "update", text: "Order details updated", at }],
      updated_at: at,
    })),
  );
}

export async function deletePurchaseOrders(ids: string[]): Promise<void> {
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

export async function setPurchaseOrderStatus(
  id: string,
  status: POStatus,
  options: { by?: string; office?: string; remarks?: string } = {},
): Promise<PurchaseOrder> {
  const at = nowIso();
  return rowToPO(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      status,
      approvals: [
        ...(r.approvals ?? []),
        { step: status, by: options.by, office: options.office, at, remarks: options.remarks, byUid: writerUid() },
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
 * Voids a purchase order instead of deleting it (see api.supabase.ts).
 * Checked again inside the transaction, so an order issued a moment ago is
 * not voided on stale information; firestore.rules require the reason and
 * that the step is signed by the account taking it.
 */
export async function cancelPurchaseOrder(
  id: string,
  input: { reason: string; by: string; office?: string },
): Promise<PurchaseOrder> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for voiding the order.");
  const at = nowIso();
  return rowToPO(
    await updateRow(TABLE, id, notFound(id), (r) => {
      if (r.issued_at) throw new Error(`${r.po_number} has been issued to the supplier and cannot be voided.`);
      if (!canVoidPO({ status: r.status, issuedAt: r.issued_at ?? undefined })) {
        throw new Error(`${r.po_number} is ${r.status} and cannot be voided.`);
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

/**
 * Records the order being issued to the supplier. Kept out of the approval
 * timeline: the order's internal approval is already complete by this point.
 * Checked inside the transaction, so two clerks cannot both issue it.
 */
export async function issuePurchaseOrder(
  id: string,
  options: { by?: string } = {},
): Promise<PurchaseOrder> {
  const at = nowIso();
  const by = options.by ?? "Administrator";
  return rowToPO(
    await updateRow(TABLE, id, notFound(id), (r) => {
      if (r.issued_at) throw new Error(`${r.po_number} has already been issued.`);
      return {
        issued_at: at,
        issued_by: by,
        history: [
          ...(r.history ?? []),
          { id: uid(), kind: "status", text: `Issued to ${poSupplierName(rowToPO(r))} by ${by}`, at },
        ],
        updated_at: at,
      };
    }),
  );
}

/** Records the supplier acknowledging receipt of an issued order. */
export async function acknowledgePurchaseOrder(
  id: string,
  options: { by?: string } = {},
): Promise<PurchaseOrder> {
  const at = nowIso();
  return rowToPO(
    await updateRow(TABLE, id, notFound(id), (r) => {
      if (!r.issued_at) throw new Error(`${r.po_number} must be issued first.`);
      if (r.acknowledged_at) throw new Error(`${r.po_number} has already been acknowledged.`);
      const by = options.by ?? poSupplierName(rowToPO(r));
      return {
        acknowledged_at: at,
        acknowledged_by: by,
        history: [...(r.history ?? []), { id: uid(), kind: "status", text: `Acknowledged by ${by}`, at }],
        updated_at: at,
      };
    }),
  );
}

export async function addPurchaseOrderComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<PurchaseOrder> {
  const at = nowIso();
  return rowToPO(
    await updateRow(TABLE, id, notFound(id), (r) => ({
      comments: [...(r.comments ?? []), { id: uid(), createdAt: at, ...input }],
      history: [...(r.history ?? []), { id: uid(), kind: "comment", text: `${input.author} commented`, at }],
      updated_at: at,
    })),
  );
}

export async function removePurchaseOrderAttachment(
  id: string,
  attachmentId: string,
): Promise<PurchaseOrder> {
  const current = await getPurchaseOrder(id);
  if (!current) throw new Error(notFound(id));
  const removed = current.attachments.find((a) => a.id === attachmentId);
  if (removed?.path) await removeAttachmentFile(removed.path);
  const at = nowIso();
  return rowToPO(
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
