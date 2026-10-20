import { dateOnly, fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { uploadAttachmentInputs } from "@/lib/storage";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import { deductStock } from "@/features/inventory/api";
import {
  risTotalIssued,
  VOIDABLE_RIS_STATUSES,
  type RISItem,
  type RISListFilters,
  type RISStatus,
  type RequestForIssuance,
} from "@/features/ris/types";
import type { AttachmentInput } from "@/features/shared/attachment-list";

/**
 * RIS service — Supabase-backed. Releasing a slip goes through the inventory
 * service (stock deduction + stock card) before the status is recorded.
 */

const TABLE = "ris_requests";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToRIS(r: any): RequestForIssuance {
  return {
    id: r.id,
    risNumber: r.ris_number,
    prNumber: r.pr_number ?? undefined,
    fund: r.fund ?? undefined,
    division: r.division ?? undefined,
    fppCode: r.fpp_code ?? undefined,
    poNumber: r.po_number ?? undefined,
    departmentCode: r.department_code,
    requester: r.requester,
    purpose: r.purpose,
    issuedBy: r.issued_by,
    receivedBy: r.received_by,
    issueDate: r.issue_date,
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

export async function listRequests(filters: RISListFilters = {}): Promise<RequestForIssuance[]> {
  const db = requireDb();
  // Newest first by when the record was raised. The document number only
  // breaks ties: numbers are not always issued in date order, so sorting on
  // them alone puts an older request above a newer one.
  let q = db
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .order("ris_number", { ascending: false });
  if (filters.departmentCode) q = q.eq("department_code", filters.departmentCode);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("issue_date", dateOnly(filters.dateFrom));
  if (filters.dateTo) q = q.lte("issue_date", dateOnly(filters.dateTo));
  if (filters.search?.trim()) {
    q = q.or(
      searchOr(
        ["ris_number", "pr_number", "po_number", "requester", "purpose", "department_code", "issued_by"],
        filters.search,
      ),
    );
  }
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToRIS);
}

export async function getRequest(id: string): Promise<RequestForIssuance | null> {
  const db = requireDb();
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToRIS(data) : null;
}

export interface RISDraftInput {
  prNumber?: string;
  poNumber?: string;
  departmentCode: string;
  requester: string;
  purpose: string;
  fund?: string;
  division?: string;
  fppCode?: string;
  receivedBy: string;
  items: Omit<RISItem, "id">[];
  attachments: AttachmentInput[];
}

export async function createRequest(
  input: RISDraftInput,
  options: { asDraft?: boolean } = {},
): Promise<RequestForIssuance> {
  const db = requireDb();
  const risNumber = await nextDocumentNumber("RIS");
  const at = nowIso();
  const status: RISStatus = options.asDraft ? "Draft" : "Pending Approval";
  const attachments = (await uploadAttachmentInputs(input.attachments, risNumber)).map((a) => ({
    ...a,
    id: uid(),
    uploadedAt: at,
  }));
  const row = {
    id: risNumber,
    ris_number: risNumber,
    pr_number: input.prNumber?.trim() || null,
    fund: input.fund?.trim() || null,
    division: input.division?.trim() || null,
    fpp_code: input.fppCode?.trim() || null,
    po_number: input.poNumber ?? null,
    department_code: input.departmentCode,
    requester: input.requester,
    purpose: input.purpose,
    issued_by: "Administrator",
    received_by: input.receivedBy,
    issue_date: at.slice(0, 10),
    status,
    items: input.items.map((it) => ({ ...it, id: uid() })),
    attachments,
    comments: [],
    history: [
      { id: uid(), kind: "create", text: `${risNumber} created from ${input.prNumber}`, at },
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
  return rowToRIS(unwrap(await db.from(TABLE).insert(row).select().single()));
}

export async function updateRequest(id: string, input: RISDraftInput): Promise<RequestForIssuance> {
  const db = requireDb();
  const current = await getRequest(id);
  if (!current) throw new Error(`RIS not found: ${id}`);
  const at = nowIso();
  const uploaded = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    current.risNumber,
  );
  const row = {
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
    attachments: [
      ...current.attachments,
      ...uploaded.map((a) => ({ ...a, id: uid(), uploadedAt: at })),
    ],
    history: [...current.history, { id: uid(), kind: "update", text: "Slip details updated", at }],
    updated_at: at,
  };
  return rowToRIS(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function deleteRequests(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(TABLE).delete().in("id", ids));
}

/**
 * Status transition. Releasing deducts inventory and writes stock-card
 * transactions before the status is recorded; a failed deduction aborts.
 */
export async function setRequestStatus(
  id: string,
  status: RISStatus,
  options: { by?: string; office?: string; remarks?: string } = {},
): Promise<RequestForIssuance> {
  const db = requireDb();
  const current = await getRequest(id);
  if (!current) throw new Error(`RIS not found: ${id}`);
  const at = nowIso();
  const history = [...current.history];

  if (status === "Released") {
    // Lines that name an item outside the register have nothing to deduct.
    const entries = await deductStock(
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

  const row = {
    status,
    approvals: [
      ...current.approvals,
      { step: status, by: options.by, office: options.office, at, remarks: options.remarks },
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
  };
  return rowToRIS(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

/**
 * Voids a slip instead of deleting it: the status becomes Cancelled and the
 * number, record and history stay, with the reason in the approval timeline.
 * On this database only a slip that has not been released can be voided —
 * returning released stock in one safe step needs the Firebase backend
 * (voidReleasedRis). A Completed slip is final.
 */
export async function cancelRequest(
  id: string,
  input: { reason: string; by: string; office?: string },
): Promise<RequestForIssuance> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for voiding the slip.");
  const current = await getRequest(id);
  if (!current) throw new Error(`RIS not found: ${id}`);
  if (current.status === "Released") {
    throw new Error(
      `${current.risNumber} has been released. Return its stock through Inventory first; a released slip cannot be voided here.`,
    );
  }
  if (!VOIDABLE_RIS_STATUSES.includes(current.status)) {
    throw new Error(`${current.risNumber} is ${current.status} and cannot be voided.`);
  }
  return setRequestStatus(id, "Cancelled", { by: input.by, office: input.office, remarks: reason });
}

export async function addRequestComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<RequestForIssuance> {
  const db = requireDb();
  const current = await getRequest(id);
  if (!current) throw new Error(`RIS not found: ${id}`);
  const at = nowIso();
  const row = {
    comments: [...current.comments, { id: uid(), createdAt: at, ...input }],
    history: [
      ...current.history,
      { id: uid(), kind: "comment", text: `${input.author} commented`, at },
    ],
    updated_at: at,
  };
  return rowToRIS(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function removeRequestAttachment(
  id: string,
  attachmentId: string,
): Promise<RequestForIssuance> {
  const db = requireDb();
  const current = await getRequest(id);
  if (!current) throw new Error(`RIS not found: ${id}`);
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
  return rowToRIS(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export function exportRequestsCsv(rows: RequestForIssuance[]): string {
  const header = ["RIS Number", "PR Number", "PO Number", "Office", "Requester", "Issued By", "Items Issued", "Status", "Issued"];
  const lines = rows.map((ris) =>
    [
      ris.risNumber,
      ris.prNumber,
      ris.poNumber ?? "",
      ris.departmentCode,
      `"${ris.requester}"`,
      `"${ris.issuedBy}"`,
      risTotalIssued(ris),
      ris.status,
      ris.issueDate,
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export interface StockSuggestion {
  name: string;
  unit: string;
  inStock: boolean;
}

/**
 * Items from central stock whose name contains the query, for the portal's
 * RIS form (migration 050). Anonymous visitors cannot read the register, so
 * this goes through a function that returns only name, unit and whether any
 * is on hand. Any failure, including the function not existing yet, returns
 * no suggestions: they are a help, and the form works without them.
 */
export async function suggestStock(query: string): Promise<StockSuggestion[]> {
  if (query.trim().length < 2) return [];
  try {
    const { data, error } = await requireDb().rpc("portal_stock_suggestions", {
      p_query: query.trim(),
    });
    if (error || !Array.isArray(data)) return [];
    return (data as { name: string; unit: string; in_stock: boolean }[]).map((r) => ({
      name: r.name,
      unit: r.unit,
      inStock: r.in_stock,
    }));
  } catch {
    return [];
  }
}
