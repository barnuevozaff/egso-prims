import type { AttachmentRecord } from "@/features/shared/attachment-list";
import type { ThreadComment } from "@/features/shared/comment-thread";
import type { HistoryEntry } from "@/features/shared/history-feed";

/** Requisition and Issue Slip domain types. Shapes mirror the future Supabase schema. */

/**
 * Since 22 Oct 2026: Pending Approval → Approved (approval issues the stock)
 * or Rejected. Released and Completed belong to slips issued under the
 * earlier workflow; they stay valid and printable, and nothing moves them.
 */
export type RISStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Released"
  | "Completed"
  | "Cancelled";

export const RIS_STATUSES: RISStatus[] = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Rejected",
  "Released",
  "Completed",
  "Cancelled",
];

/**
 * Stages a slip can be voided from. Before its stock is issued nothing has
 * moved; an issued slip (Approved since 22 Oct 2026, or Released earlier) is
 * voided by an Administrator only, and its stock is returned in the same
 * step (voidReleasedRis). A Completed slip is final.
 */
export const VOIDABLE_RIS_STATUSES: RISStatus[] = ["Draft", "Pending Approval", "Approved", "Released"];

export interface RISItem {
  id: string;
  /** Stock item this line issues from; absent when the request names an
   *  item that is not in the register. */
  inventoryItemId?: string;
  /** Stock number as it stood when the slip was raised. */
  stockNo?: string;
  name: string;
  unit: string;
  requestedQty: number;
  issuedQty: number;
}

export interface RequestForIssuance {
  id: string;
  risNumber: string;
  /** Source purchase request. Absent on slips raised from the public portal. */
  prNumber?: string;
  /** Related purchase order, when the stock originated from one. */
  poNumber?: string;
  /** Requesting office, as written by the requester. */
  departmentCode: string;
  /** "Requested by" — the person raising the slip. */
  requester: string;
  purpose: string;
  /** Charge details, all optional on the form. */
  fund?: string;
  division?: string;
  fppCode?: string;
  issuedBy: string;
  receivedBy: string;
  /** ISO date the slip was issued/raised. */
  issueDate: string;
  status: RISStatus;
  /** When approval issued the stock (22 Oct 2026); absent before, and on older slips. */
  stockIssuedAt?: string;
  items: RISItem[];
  attachments: AttachmentRecord[];
  comments: ThreadComment[];
  history: HistoryEntry[];
  approvals: { step: string; by?: string; office?: string; at?: string; remarks?: string }[];
  createdAt: string;
  updatedAt: string;
}

export function risTotalIssued(ris: Pick<RequestForIssuance, "items">): number {
  return ris.items.reduce((sum, it) => sum + it.issuedQty, 0);
}

/** Filters accepted by the list endpoint (maps 1:1 to future Supabase query). */
export interface RISListFilters {
  search?: string;
  departmentCode?: string;
  status?: RISStatus;
  dateFrom?: Date;
  dateTo?: Date;
}
