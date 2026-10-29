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
 * The office codes records were filed under before 29 Oct 2026, kept only so
 * those records still show their office's name. They are offered nowhere:
 * every office field and filter lists the office directory instead
 * (src/features/offices, Settings → Office / Department Management), and new
 * records carry the office's name. A record whose office was typed by hand
 * keeps its text; departmentByCode shows it as is.
 */
export const LEGACY_DEPARTMENTS: Department[] = [
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
  /** The signed-in account that took the step (Firebase). */
  byUid?: string;
}

export interface PRHeading {
  id?: string;
  /** Index of the item the heading stands above. */
  position: number;
  text: string;
}

export interface PRSignatory {
  name: string;
  designation: string;
}

export interface PRSignatories {
  requestedBy: PRSignatory | null;
  cashAvailability: PRSignatory | null;
  approvedBy: PRSignatory | null;
}

export interface PurchaseRequest {
  id: string;
  prNumber: string;
  departmentCode: string;
  requester: string;
  /**
   * Empty until the GSO completes it: the public form no longer asks for it
   * (approved 21 Oct 2026), and a request is not approved without one.
   */
  purpose: string;
  /** Unset when Settings has no default fund and the filer chose none. */
  fundingSource?: FundingSource;
  /** Optional lines of the official form, printed as blanks when empty. */
  section?: string;
  fpp?: string;
  /** Group headings the GSO adds to the item table; not items (no number, no cost). */
  headings?: PRHeading[];
  /**
   * The official PR number (e.g. 100-2026-000001), assigned at approval by
   * the approvePurchaseRequest function. Separate from `prNumber`, the
   * PR-YYYY-NNNNNN tracking reference. The prefix is provisional.
   */
  officialPrNumber?: string;
  officialPrNumberAssignedAt?: string;
  officialPrNumberAssignedBy?: string;
  /**
   * The Purchase Order created with this request's approval (21 Oct 2026),
   * e.g. PO-2026-000004. Set by the server only.
   */
  poNumber?: string;
  /** The signatories as they stood when the request was approved; fixed from then on. */
  signatories?: PRSignatories;
  /** Date the request was raised (ISO). */
  requestDate: string;
  status: PRStatus;
  items: PRItem[];
  attachments: PRAttachment[];
  comments: PRComment[];
  history: PRHistoryEntry[];
  approvals: ApprovalRecord[];
  /**
   * The staff account that raised the request; absent for requests filed on
   * the public portal and for records saved before ownership was kept.
   */
  createdByUid?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * What a request is, for a one-line summary (lists, tracking, pickers): its
 * purpose, or else its first item, or else its number. Never an invented
 * purpose (approved 21 Oct 2026).
 */
/**
 * An item description as the official form prints it: the first letter in
 * capitals, everything after it exactly as typed, so acronyms, brands, sizes
 * and codes are kept ("bond paper a4" → "Bond paper a4", "EPSON ink 003" stays).
 */
export function capitalizeFirstLetter(value: string): string {
  const i = value.search(/\p{L}/u);
  return i < 0 ? value : value.slice(0, i) + value.charAt(i).toLocaleUpperCase("en-PH") + value.slice(i + 1);
}

export function prSummary(pr: Pick<PurchaseRequest, "purpose" | "items" | "prNumber">): string {
  const purpose = pr.purpose?.trim();
  if (purpose) return purpose;
  const first = pr.items[0]?.description?.trim();
  if (!first) return pr.prNumber;
  const more = pr.items.length - 1;
  return more > 0 ? `${first} and ${more} more item${more === 1 ? "" : "s"}` : first;
}

export function departmentByCode(code: string): Department {
  return (
    LEGACY_DEPARTMENTS.find((d) => d.code === code) ?? {
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
