import { dateOnly, fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { uploadAttachmentInputs } from "@/lib/storage";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import {
  poTotal,
  poSupplierName,
  canVoidPO,
  type POItem,
  type POListFilters,
  type POStatus,
  type PurchaseOrder,
} from "@/features/purchase-orders/types";
import type { AttachmentInput } from "@/features/shared/attachment-list";

/**
 * Purchase Order service — Supabase-backed. Same signatures the UI has used
 * since Sprint 3; components never touch Supabase directly.
 */

const TABLE = "purchase_orders";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToPO(r: any): PurchaseOrder {
  return {
    id: r.id,
    poNumber: r.po_number,
    prNumber: r.pr_number,
    departmentCode: r.department_code,
    requester: r.requester,
    purpose: r.purpose,
    supplierId: r.supplier_id ?? undefined,
    issuedAt: r.issued_at ?? undefined,
    issuedBy: r.issued_by ?? undefined,
    acknowledgedAt: r.acknowledged_at ?? undefined,
    acknowledgedBy: r.acknowledged_by ?? undefined,
    supplierName: r.supplier_name ?? "",
    supplierAddress: r.supplier_address ?? undefined,
    supplierTin: r.supplier_tin ?? undefined,
    supplierContact: r.supplier_contact ?? undefined,
    modeOfProcurement: r.mode_of_procurement ?? undefined,
    paymentTerm: r.payment_term ?? undefined,
    deliveryTerm: r.delivery_term ?? undefined,
    municipalMayor: r.municipal_mayor ?? undefined,
    bacSecretary: r.bac_secretary ?? undefined,
    prOfficialNumber: r.pr_official_number ?? undefined,
    signatories: r.signatories
      ? {
          approvedBy: r.signatories.approved_by ?? null,
          bacSecretary: r.signatories.bac_secretary ?? null,
        }
      : undefined,
    poDate: r.po_date ?? undefined,
    approvedAt: r.approved_at ?? undefined,
    approvedBy: r.approved_by ?? undefined,
    authorization: r.authorization ?? undefined,
    authorizedItems: r.authorized_items ?? undefined,
    bacResolutionNo: r.bac_resolution_no ?? undefined,
    bacResolutionSeries: r.bac_resolution_series ?? undefined,
    deliveryAddress: r.delivery_address,
    expectedDelivery: r.expected_delivery || undefined,
    issuedDate: r.issued_date,
    status: r.status,
    items: r.items ?? [],
    attachments: r.attachments ?? [],
    comments: r.comments ?? [],
    history: r.history ?? [],
    approvals: r.approvals ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listPurchaseOrders(filters: POListFilters = {}): Promise<PurchaseOrder[]> {
  const db = requireDb();
  // Newest first by when the record was raised. The document number only
  // breaks ties: numbers are not always issued in date order, so sorting on
  // them alone puts an older request above a newer one.
  let q = db
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .order("po_number", { ascending: false });
  if (filters.departmentCode) q = q.eq("department_code", filters.departmentCode);
  if (filters.supplierName) q = q.eq("supplier_name", filters.supplierName);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("issued_date", dateOnly(filters.dateFrom));
  if (filters.dateTo) q = q.lte("issued_date", dateOnly(filters.dateTo));
  if (filters.search?.trim()) {
    q = q.or(
      searchOr(["po_number", "pr_number", "requester", "purpose", "department_code"], filters.search),
    );
  }
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToPO);
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  const db = requireDb();
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToPO(data) : null;
}

export interface PODraftInput {
  prNumber: string;
  departmentCode: string;
  requester: string;
  purpose: string;
  supplierName: string;
  supplierAddress?: string;
  supplierTin?: string;
  supplierContact?: string;
  modeOfProcurement?: string;
  paymentTerm?: string;
  deliveryTerm?: string;
  /** Negotiated purchase only. */
  bacResolutionNo?: string;
  bacResolutionSeries?: string;
  deliveryAddress: string;
  /** Optional, as on the paper form. */
  expectedDelivery?: string;
  items: Omit<POItem, "id">[];
  attachments: AttachmentInput[];
}

export async function createPurchaseOrder(
  input: PODraftInput,
  options: { asDraft?: boolean } = {},
): Promise<PurchaseOrder> {
  const db = requireDb();
  const poNumber = await nextDocumentNumber("PO");
  const at = nowIso();
  const status: POStatus = options.asDraft ? "Draft" : "Pending Approval";
  const attachments = (await uploadAttachmentInputs(input.attachments, poNumber)).map((a) => ({
    ...a,
    id: uid(),
    uploadedAt: at,
  }));
  const row = {
    id: poNumber,
    po_number: poNumber,
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
    delivery_address: input.deliveryAddress,
    expected_delivery: input.expectedDelivery || null,
    issued_date: at.slice(0, 10),
    status,
    items: input.items.map((it) => ({ ...it, id: uid() })),
    attachments,
    comments: [],
    history: [
      { id: uid(), kind: "create", text: `${poNumber} created from ${input.prNumber}`, at },
      ...(options.asDraft
        ? []
        : [{ id: uid(), kind: "status", text: "Status → Pending Approval", at }]),
    ],
    approvals: [
      { step: "Created", by: "Administrator", office: "General Services Office", at },
      ...(options.asDraft
        ? []
        : [{ step: "Pending Approval", by: "Administrator", office: "General Services Office", at }]),
    ],
    created_at: at,
    updated_at: at,
  };
  return rowToPO(unwrap(await db.from(TABLE).insert(row).select().single()));
}

export async function updatePurchaseOrder(id: string, input: PODraftInput): Promise<PurchaseOrder> {
  const db = requireDb();
  const current = await getPurchaseOrder(id);
  if (!current) throw new Error(`Purchase order not found: ${id}`);
  const at = nowIso();
  const uploaded = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    current.poNumber,
  );
  const row = {
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
    delivery_address: input.deliveryAddress,
    expected_delivery: input.expectedDelivery || null,
    items: input.items.map((it) => ({ ...it, id: uid() })),
    attachments: [
      ...current.attachments,
      ...uploaded.map((a) => ({ ...a, id: uid(), uploadedAt: at })),
    ],
    history: [...current.history, { id: uid(), kind: "update", text: "Order details updated", at }],
    updated_at: at,
  };
  return rowToPO(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function deletePurchaseOrders(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(TABLE).delete().in("id", ids));
}

export async function setPurchaseOrderStatus(
  id: string,
  status: POStatus,
  options: { by?: string; office?: string; remarks?: string } = {},
): Promise<PurchaseOrder> {
  const db = requireDb();
  const current = await getPurchaseOrder(id);
  if (!current) throw new Error(`Purchase order not found: ${id}`);
  const at = nowIso();
  const row = {
    status,
    approvals: [
      ...current.approvals,
      { step: status, by: options.by, office: options.office, at, remarks: options.remarks },
    ],
    history: [
      ...current.history,
      {
        id: uid(),
        kind: "status",
        text: options.remarks ? `Status → ${status}: ${options.remarks}` : `Status → ${status}`,
        at,
      },
    ],
    updated_at: at,
  };
  return rowToPO(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

/**
 * Voids a purchase order instead of deleting it: the status becomes
 * Cancelled and the number, record and history stay. The reason, who voided
 * it and when go into the approval timeline and the history. An order
 * already issued to the supplier, Released or Completed is final.
 */
export async function cancelPurchaseOrder(
  id: string,
  input: { reason: string; by: string; office?: string },
): Promise<PurchaseOrder> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for voiding the order.");
  const current = await getPurchaseOrder(id);
  if (!current) throw new Error(`Purchase order not found: ${id}`);
  if (!canVoidPO(current)) {
    throw new Error(
      current.issuedAt
        ? `${current.poNumber} has been issued to the supplier and cannot be voided.`
        : `${current.poNumber} is ${current.status} and cannot be voided.`,
    );
  }
  return setPurchaseOrderStatus(id, "Cancelled", { by: input.by, office: input.office, remarks: reason });
}

/**
 * Records the order being issued to the supplier. Kept out of the approval
 * timeline: the order's internal approval is already complete by this point.
 */
export async function issuePurchaseOrder(
  id: string,
  options: { by?: string } = {},
): Promise<PurchaseOrder> {
  const db = requireDb();
  const current = await getPurchaseOrder(id);
  if (!current) throw new Error(`Purchase order not found: ${id}`);
  if (current.issuedAt) throw new Error(`${current.poNumber} has already been issued.`);
  const at = nowIso();
  const by = options.by ?? "Administrator";
  const row = {
    issued_at: at,
    issued_by: by,
    history: [
      ...current.history,
      { id: uid(), kind: "status", text: `Issued to ${poSupplierName(current)} by ${by}`, at },
    ],
    updated_at: at,
  };
  return rowToPO(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

/** Records the supplier acknowledging receipt of an issued order. */
export async function acknowledgePurchaseOrder(
  id: string,
  options: { by?: string } = {},
): Promise<PurchaseOrder> {
  const db = requireDb();
  const current = await getPurchaseOrder(id);
  if (!current) throw new Error(`Purchase order not found: ${id}`);
  if (!current.issuedAt) throw new Error(`${current.poNumber} must be issued first.`);
  if (current.acknowledgedAt) {
    throw new Error(`${current.poNumber} has already been acknowledged.`);
  }
  const at = nowIso();
  const by = options.by ?? poSupplierName(current);
  const row = {
    acknowledged_at: at,
    acknowledged_by: by,
    history: [
      ...current.history,
      { id: uid(), kind: "status", text: `Acknowledged by ${by}`, at },
    ],
    updated_at: at,
  };
  return rowToPO(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function addPurchaseOrderComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<PurchaseOrder> {
  const db = requireDb();
  const current = await getPurchaseOrder(id);
  if (!current) throw new Error(`Purchase order not found: ${id}`);
  const at = nowIso();
  const row = {
    comments: [...current.comments, { id: uid(), createdAt: at, ...input }],
    history: [
      ...current.history,
      { id: uid(), kind: "comment", text: `${input.author} commented`, at },
    ],
    updated_at: at,
  };
  return rowToPO(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function removePurchaseOrderAttachment(
  id: string,
  attachmentId: string,
): Promise<PurchaseOrder> {
  const db = requireDb();
  const current = await getPurchaseOrder(id);
  if (!current) throw new Error(`Purchase order not found: ${id}`);
  const removed = current.attachments.find((a) => a.id === attachmentId);
  const at = nowIso();
  if (removed?.path) {
    await db.storage.from("attachments").remove([removed.path]);
  }
  const row = {
    attachments: current.attachments.filter((a) => a.id !== attachmentId),
    history: [
      ...current.history,
      {
        id: uid(),
        kind: "attachment",
        text: `Attachment removed${removed ? `: ${removed.name}` : ""}`,
        at,
      },
    ],
    updated_at: at,
  };
  return rowToPO(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export function exportPurchaseOrdersCsv(rows: PurchaseOrder[]): string {
  const header = ["PO Number", "PR Number", "Supplier", "Office", "Amount", "Status", "Issued"];
  const lines = rows.map((po) =>
    [
      po.poNumber,
      po.prNumber,
      `"${poSupplierName(po)}"`,
      po.departmentCode,
      poTotal(po),
      po.status,
      po.issuedDate,
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

/** The order's document details: every field optional (21 Oct 2026). */
export interface PODetailsInput {
  supplierName?: string;
  supplierAddress?: string;
  supplierTin?: string;
  supplierContact?: string;
  modeOfProcurement?: string;
  deliveryAddress?: string;
  /** YYYY-MM-DD */
  expectedDelivery?: string;
  deliveryTerm?: string;
  paymentTerm?: string;
  bacResolutionNo?: string;
  bacResolutionSeries?: string;
  items?: (Omit<POItem, "id"> & { id?: string })[];
}

/** Completing or correcting an order is a Cloud Function, which the Supabase version does not have. */
export async function updatePurchaseOrderDetails(
  _id: string,
  _details: PODetailsInput,
  _options: { reason?: string; by?: string } = {},
): Promise<PurchaseOrder> {
  throw new Error("Purchase order details are saved only on the Firebase backend.");
}
