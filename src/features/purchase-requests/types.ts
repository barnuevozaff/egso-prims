/** Purchase Request domain types. Shapes mirror the future Supabase schema. */

/**
 * Only the GSO uses the system (its head and staff), so a request goes from
 * Submitted straight to the head's approval. Department Head Review and Budget
 * Review were removed on 18 Oct 2026; no stored request was in either.
 */
export type PRStatus =
  | "Draft"
  | "Submitted"
  | "Approved"
  | "Rejected"
  | "Cancelled"
  | "Completed";

export const PR_STATUSES: PRStatus[] = [
  "Draft",
  "Submitted",
  "Approved",
  "Rejected",
  "Cancelled",
  "Completed",
];

/**
 * Statuses that count as "awaiting someone". A Draft belongs to its author and
 * is not yet anyone's queue, so it is deliberately absent. Shared by the
 * dashboard tile and the sidebar badge so the two can never disagree.
 */
export const PENDING_PR_STATUSES: PRStatus[] = ["Submitted"];

export interface Department {
  code: string;
  name: string;
  /** Identity color (Tailwind bg class) used for document chips. */
  color: string;
}

/**
 * The municipal offices, as GSO lists them (15 Oct 2026). The first ten codes
 * predate the list and are on existing records, so they must stay. A record
 * whose office was typed by hand keeps its text; departmentByCode shows it as is.
 */
export const DEPARTMENTS: Department[] = [
  { code: "MO", name: "Office of the Municipal Mayor", color: "bg-blue-500" },
  { code: "SB", name: "Sangguniang Bayan (Office of the Vice Mayor)", color: "bg-blue-700" },
  { code: "HRMO", name: "Human Resource Management Office", color: "bg-cyan-600" },
  { code: "MPDO", name: "Municipal Planning and Development Office", color: "bg-sky-500" },
  { code: "TRE", name: "Municipal Treasury Office", color: "bg-amber-500" },
  { code: "MBO", name: "Municipal Budget Office", color: "bg-indigo-500" },
  { code: "ACC", name: "Municipal Accounting Office", color: "bg-emerald-500" },
  { code: "MASSO", name: "Municipal Assessor's Office", color: "bg-yellow-600" },
  { code: "MCRO", name: "Municipal Civil Registry Office", color: "bg-pink-500" },
  { code: "GSO", name: "General Services Office", color: "bg-neutral-800" },
  { code: "ENG", name: "Municipal Engineering Office", color: "bg-orange-500" },
  { code: "MHO", name: "Municipal Health Office", color: "bg-rose-500" },
  { code: "MSWDO", name: "Municipal Social Welfare and Development Office", color: "bg-violet-500" },
  { code: "MAO", name: "Municipal Agriculture Office", color: "bg-green-500" },
  { code: "MDRRMO", name: "Municipal Disaster Risk Reduction and Management Office", color: "bg-red-600" },
  { code: "MENRO", name: "Municipal Environment and Natural Resources Office", color: "bg-teal-600" },
  { code: "PESO", name: "Public Employment Service Office", color: "bg-fuchsia-600" },
  { code: "MYDO", name: "Municipal Youth Development Office", color: "bg-lime-600" },
  { code: "MTOUR", name: "Municipal Tourism Office", color: "bg-purple-600" },
];

export const FUNDING_SOURCES = [
  "General Fund",
  "Special Education Fund",
  "Trust Fund",
  "20% Development Fund",
  "DRRM Fund",
] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];

export const ITEM_UNITS = [
  "pc",
  "box",
  "ream",
  "set",
  "unit",
  "gal",
  "kg",
  "sack",
  "roll",
  "bottle",
] as const;

export interface PRItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  /** Estimated unit cost in PHP. */
  estimatedCost: number;
}

export interface PRAttachment {
  id: string;
  name: string;
  kind: "pdf" | "image";
  /** Bytes. */
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  /** Supabase Storage public URL (present once uploaded). */
  url?: string;
  /** Supabase Storage object path. */
  path?: string;
}

export interface PRComment {
  id: string;
  author: string;
  office: string;
  text: string;
  createdAt: string;
  attachments?: string[];
}

export interface PRHistoryEntry {
  id: string;
  kind: "create" | "update" | "status" | "comment" | "attachment";
  text: string;
  at: string;
}

export interface ApprovalRecord {
  step: string;
  by?: string;
  office?: string;
  at?: string;
  remarks?: string;
}

export interface PurchaseRequest {
  id: string;
  prNumber: string;
  departmentCode: string;
  requester: string;
  purpose: string;
  fundingSource: FundingSource;
  /** Date the request was raised (ISO). */
  requestDate: string;
  status: PRStatus;
  items: PRItem[];
  attachments: PRAttachment[];
  comments: PRComment[];
  history: PRHistoryEntry[];
  approvals: ApprovalRecord[];
  createdAt: string;
  updatedAt: string;
}

export function departmentByCode(code: string): Department {
  return (
    DEPARTMENTS.find((d) => d.code === code) ?? {
      code,
      name: code,
      color: "bg-neutral-500",
    }
  );
}

export function prTotal(pr: Pick<PurchaseRequest, "items">): number {
  return pr.items.reduce((sum, it) => sum + it.quantity * it.estimatedCost, 0);
}

/** Filters accepted by the list endpoint (maps 1:1 to future Supabase query). */
export interface PRListFilters {
  search?: string;
  departmentCode?: string;
  status?: PRStatus;
  dateFrom?: Date;
  dateTo?: Date;
}
