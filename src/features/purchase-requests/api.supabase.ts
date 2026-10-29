import { dateOnly, fetchAll, requireDb, searchOr, unwrap } from "@/lib/db";
import { uploadAttachmentInputs } from "@/lib/storage";
import { nextDocumentNumber } from "@/features/shared/doc-numbers";
import {
  prTotal,
  type PRHeading,
  type PRListFilters,
  type PRStatus,
  type PurchaseRequest,
} from "@/features/purchase-requests/types";
import type { AttachmentInput } from "@/features/shared/attachment-list";

/**
 * Purchase Request service — Supabase-backed. Same signatures the UI has
 * used since Sprint 2; components never touch Supabase directly.
 */

const TABLE = "purchase_requests";
const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToPR(r: any): PurchaseRequest {
  return {
    id: r.id,
    prNumber: r.pr_number,
    departmentCode: r.department_code,
    requester: r.requester,
    purpose: r.purpose ?? "",
    fundingSource: r.funding_source || undefined,
    section: r.section ?? undefined,
    fpp: r.fpp ?? undefined,
    headings: Array.isArray(r.headings) ? r.headings : [],
    officialPrNumber: r.official_pr_number ?? undefined,
    officialPrNumberAssignedAt: r.official_pr_number_assigned_at ?? undefined,
    officialPrNumberAssignedBy: r.official_pr_number_assigned_by ?? undefined,
    poNumber: r.po_number ?? undefined,
    signatories: r.signatories
      ? {
          requestedBy: r.signatories.requested_by ?? null,
          cashAvailability: r.signatories.cash_availability ?? null,
          approvedBy: r.signatories.approved_by ?? null,
        }
      : undefined,
    requestDate: r.request_date,
    status: r.status,
    items: r.items ?? [],
    attachments: r.attachments ?? [],
    comments: r.comments ?? [],
    history: r.history ?? [],
    approvals: r.approvals ?? [],
    createdByUid: r.created_by_uid ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listPurchaseRequests(
  filters: PRListFilters = {},
): Promise<PurchaseRequest[]> {
  const db = requireDb();
  // Newest first by when the record was raised. The document number only
  // breaks ties: numbers are not always issued in date order, so sorting on
  // them alone puts an older request above a newer one.
  let q = db
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .order("pr_number", { ascending: false });
  if (filters.departmentCode) q = q.eq("department_code", filters.departmentCode);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("request_date", dateOnly(filters.dateFrom));
  if (filters.dateTo) q = q.lte("request_date", dateOnly(filters.dateTo));
  if (filters.search?.trim()) {
    q = q.or(searchOr(["pr_number", "requester", "purpose", "department_code"], filters.search));
  }
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToPR);
}

export async function getPurchaseRequest(id: string): Promise<PurchaseRequest | null> {
  const db = requireDb();
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? rowToPR(data) : null;
}

export interface PRDraftInput {
  departmentCode: string;
  requester: string;
  purpose: string;
  fundingSource?: PurchaseRequest["fundingSource"];
  section?: string;
  fpp?: string;
  /** Group headings: staff only, ignored for the public portal. */
  headings?: Omit<PRHeading, "id">[];
  requestDate: string;
  items: Omit<PurchaseRequest["items"][number], "id">[];
  attachments: AttachmentInput[];
}

export async function createPurchaseRequest(input: PRDraftInput): Promise<PurchaseRequest> {
  const db = requireDb();
  const prNumber = await nextDocumentNumber("PR");
  const at = nowIso();
  const attachments = (await uploadAttachmentInputs(input.attachments, prNumber)).map((a) => ({
    ...a,
    id: uid(),
    uploadedAt: at,
  }));
  const row = {
    id: prNumber,
    pr_number: prNumber,
    department_code: input.departmentCode,
    requester: input.requester,
    purpose: input.purpose,
    funding_source: input.fundingSource ?? "",
    request_date: input.requestDate,
    status: "Submitted" as PRStatus,
    items: input.items.map((it) => ({ ...it, id: uid() })),
    attachments,
    comments: [],
    history: [
      { id: uid(), kind: "create", text: `${prNumber} created by ${input.requester}`, at },
      { id: uid(), kind: "status", text: "Submitted for review", at },
    ],
    approvals: [
      { step: "Created", by: input.requester, at },
      { step: "Submitted", by: input.requester, at },
    ],
    created_at: at,
    updated_at: at,
  };
  return rowToPR(unwrap(await db.from(TABLE).insert(row).select().single()));
}

export async function updatePurchaseRequest(
  id: string,
  input: PRDraftInput,
): Promise<PurchaseRequest> {
  const db = requireDb();
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error(`Purchase request not found: ${id}`);
  const at = nowIso();
  const uploaded = await uploadAttachmentInputs(
    input.attachments.filter((a) => !current.attachments.some((e) => e.name === a.name)),
    current.prNumber,
  );
  const row = {
    department_code: input.departmentCode,
    requester: input.requester,
    purpose: input.purpose,
    funding_source: input.fundingSource ?? "",
    request_date: input.requestDate,
    items: input.items.map((it) => ({ ...it, id: uid() })),
    attachments: [
      ...current.attachments,
      ...uploaded.map((a) => ({ ...a, id: uid(), uploadedAt: at })),
    ],
    history: [
      ...current.history,
      { id: uid(), kind: "update", text: "Request details updated", at },
    ],
    updated_at: at,
  };
  return rowToPR(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function deletePurchaseRequests(ids: string[]): Promise<void> {
  const db = requireDb();
  unwrap(await db.from(TABLE).delete().in("id", ids));
}

export async function setPurchaseRequestStatus(
  id: string,
  status: PRStatus,
  options: { by?: string; office?: string; remarks?: string } = {},
): Promise<PurchaseRequest> {
  const db = requireDb();
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error(`Purchase request not found: ${id}`);
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
  return rowToPR(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

/** Stages a request can still be voided from. */
export const VOIDABLE_PR_STATUSES: PRStatus[] = ["Draft", "Submitted", "Approved"];

/**
 * Voids a purchase request instead of deleting it. The status becomes
 * Cancelled; the number, the record and its history stay. The reason, who
 * voided it and when go into the approval timeline and the history, the
 * same entries every other status change writes.
 */
export async function cancelPurchaseRequest(
  id: string,
  input: { reason: string; by: string; office?: string },
): Promise<PurchaseRequest> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Give a reason for voiding the request.");
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error(`Purchase request not found: ${id}`);
  if (!VOIDABLE_PR_STATUSES.includes(current.status)) {
    throw new Error(`${current.prNumber} is ${current.status} and cannot be voided.`);
  }
  return setPurchaseRequestStatus(id, "Cancelled", { by: input.by, office: input.office, remarks: reason });
}

export async function addPurchaseRequestComment(
  id: string,
  input: { author: string; office: string; text: string },
): Promise<PurchaseRequest> {
  const db = requireDb();
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error(`Purchase request not found: ${id}`);
  const at = nowIso();
  const row = {
    comments: [...current.comments, { id: uid(), createdAt: at, ...input }],
    history: [
      ...current.history,
      { id: uid(), kind: "comment", text: `${input.author} commented`, at },
    ],
    updated_at: at,
  };
  return rowToPR(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export async function removePurchaseRequestAttachment(
  id: string,
  attachmentId: string,
): Promise<PurchaseRequest> {
  const db = requireDb();
  const current = await getPurchaseRequest(id);
  if (!current) throw new Error(`Purchase request not found: ${id}`);
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
  return rowToPR(unwrap(await db.from(TABLE).update(row).eq("id", id).select().single()));
}

export function exportPurchaseRequestsCsv(rows: PurchaseRequest[]): string {
  const header = ["PR Number", "Office", "Requester", "Purpose", "Total Amount", "Date", "Status"];
  const lines = rows.map((pr) =>
    [
      pr.prNumber,
      pr.departmentCode,
      pr.requester,
      `"${pr.purpose.replaceAll('"', '""')}"`,
      prTotal(pr),
      pr.requestDate,
      pr.status,
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

/**
 * The order for an approved request (21 Oct 2026). Orders are created with the
 * approval by a Cloud Function, which the Supabase version does not have.
 */
export async function ensurePurchaseOrderForPR(_id: string): Promise<{ poNumber: string; created: boolean }> {
  throw new Error("Purchase orders are created with the approval only on the Firebase backend.");
}
