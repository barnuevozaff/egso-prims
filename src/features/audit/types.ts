import type { ThreadComment } from "@/features/shared/comment-thread";

/** Audit trail domain types. Shapes mirror the future Supabase schema. */

export type AuditSeverity = "Information" | "Success" | "Warning" | "Error" | "Critical";

export const AUDIT_SEVERITIES: AuditSeverity[] = [
  "Information",
  "Success",
  "Warning",
  "Error",
  "Critical",
];

export type AuditOutcome = "Success" | "Failed";

export const AUDIT_MODULES = [
  "Authentication",
  "Purchase Requests",
  "Purchase Orders",
  "RIS",
  "Inventory",
  "Reservations",
  "Reports",
  // Changes to Settings, such as an official's printed name (21 Oct 2026).
  "Settings",
  "System",
] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

export const AUDIT_ACTIONS = [
  "Login",
  "Logout",
  "Failed Login",
  "Create Purchase Request",
  "Update Purchase Request",
  "Approve Purchase Request",
  "Reject Purchase Request",
  "Create Purchase Order",
  "Approve Purchase Order",
  "Release Purchase Order",
  "Create RIS",
  "Approve RIS",
  "Release RIS",
  "Inventory Adjustment",
  "Stock Movement",
  "Item Registered",
  "Reservation Created",
  "Reservation Approved",
  "Reservation Cancelled",
  "Report Generated",
  "Report Exported",
  "User Created",
  "User Updated",
  "Settings Updated",
  "Backup Completed",
  "Record Created",
  "Record Updated",
  "Record Deleted",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditUser {
  name: string;
  role: string;
  departmentCode: string;
}

export const AUDIT_USERS: AuditUser[] = [
  { name: "Administrator", role: "System Administrator", departmentCode: "GSO" },
  { name: "Marites Villanueva", role: "Supply Officer", departmentCode: "GSO" },
  { name: "Engr. Paolo Madrigal", role: "GSO Head", departmentCode: "GSO" },
  { name: "Mr. Danilo Reyes", role: "Storekeeper", departmentCode: "GSO" },
  { name: "Dr. Rowena Salazar", role: "Municipal Health Officer", departmentCode: "MHO" },
  { name: "Engr. Jerome Cruz", role: "Project Engineer", departmentCode: "ENG" },
  { name: "Ms. Liza Reyes", role: "Social Welfare Officer", departmentCode: "MSWDO" },
  { name: "Mr. Nestor Abad", role: "Budget Officer", departmentCode: "MBO" },
  { name: "Ms. Gloria Santiago", role: "Treasurer", departmentCode: "TRE" },
];

export interface AuditEntry {
  id: string;
  /** ISO timestamp. */
  timestamp: string;
  user: string;
  /** Account the action was performed under. */
  email?: string;
  userRole: string;
  departmentCode: string;
  module: AuditModule;
  action: AuditAction;
  /** Affected record, when applicable. */
  documentNumber?: string;
  /** Value before / after for update-type actions. */
  previousValue?: string;
  updatedValue?: string;
  /** What the system did in response. */
  response: string;
  remarks?: string;
  ip: string;
  browser: string;
  os: string;
  sessionId: string;
  severity: AuditSeverity;
  status: AuditOutcome;
  comments: ThreadComment[];
}

/** Filters accepted by the list endpoint (maps 1:1 to future Supabase query). */
export interface AuditListFilters {
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  user?: string;
  departmentCode?: string;
  module?: AuditModule;
  action?: AuditAction;
  severity?: AuditSeverity;
  /**
   * Stop after this many of the newest entries. The dashboard shows five, and
   * without this it read the whole trail — the fastest-growing table in the
   * system — to display them.
   */
  limit?: number;
}
