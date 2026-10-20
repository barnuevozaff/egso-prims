/**
 * Records Inventory and Appraisal domain types.
 *
 * The National Archives form that describes what the office actually holds —
 * volume, medium, location, use — and the values that justify the retention
 * proposed for each series. Its sibling, the Disposition Schedule, declares
 * the retention itself; see ./types.ts.
 */

import type { RecordsDocStatus, ScheduleStatus } from "@/features/records/types";

export type { ScheduleStatus };

/**
 * Field 17. The form prints its own legend for this, so the vocabulary is
 * closed: anything else would be unreadable to the National Archives.
 */
export const TIME_VALUES = [
  { code: "T", label: "T — Temporary" },
  { code: "P", label: "P — Permanent" },
] as const;

/** Field 18. Closed for the same reason as field 17. */
export const UTILITY_VALUES = [
  { code: "Adm", label: "Adm — Administrative" },
  { code: "F", label: "F — Fiscal" },
  { code: "L", label: "L — Legal" },
  { code: "Arc", label: "Arc — Archival" },
] as const;

export type TimeValue = (typeof TIME_VALUES)[number]["code"];
export type UtilityValue = (typeof UTILITY_VALUES)[number]["code"];

/** One line of the form — fields 9 through 20. */
export interface InventoryRecord {
  id: string;
  appraisalId: string;
  itemNumber: number;
  /** Field 9. */
  titleAndDescription: string;
  /** Field 10. */
  periodCovered?: string;
  /** Field 11. */
  volume?: string;
  /** Field 12. */
  recordsMedium?: string;
  /** Field 13. */
  restrictions?: string;
  /** Field 14. */
  locationOfRecords?: string;
  /** Field 15. */
  frequencyOfUse?: string;
  /** Field 16. */
  duplication?: string;
  /** Field 17. Empty while a line is inventoried but not yet appraised. */
  timeValue?: TimeValue;
  /** Field 18. */
  utilityValue?: UtilityValue;
  /** Field 19, in years. */
  retentionActive: number;
  retentionStorage: number;
  /** Field 19 Total. Computed by the database; never sent on write. */
  retentionTotal: number;
  /** Field 20. */
  dispositionProvision?: string;
}

/** A line as the form collects it, before the database assigns identity. */
export type InventoryRecordDraft = Omit<
  InventoryRecord,
  "id" | "appraisalId" | "retentionTotal"
>;

/** The form's header — fields 1 through 8 — and the officers who sign it. */
export interface InventoryAppraisal {
  id: string;
  inventoryNo: string;
  /** Field 1. */
  officeName: string;
  /** Field 2. */
  departmentDivision?: string;
  /** Field 3. */
  sectionUnit?: string;
  /** Field 4. */
  telephoneNo?: string;
  /** Field 5. */
  emailAddress?: string;
  /** Field 6. */
  officeAddress: string;
  /** Field 7. */
  personInCharge?: string;
  /** Field 8, as yyyy-MM-dd. */
  datePrepared: string;
  /** The foot of the form. Signed by hand after printing. */
  preparedBy?: string;
  preparedByPosition?: string;
  assistedBy?: string;
  approvedBy?: string;
  status: RecordsDocStatus;
  /** Set when the form was voided (approved policy, 2026-10-20). */
  voidReason?: string;
  voidedAt?: string;
  /** The Administrator who voided it (email). */
  voidedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** An appraisal with its lines — what the detail page and print form read. */
export interface InventoryAppraisalWithRecords extends InventoryAppraisal {
  records: InventoryRecord[];
}

/** What the create and edit forms submit. */
export interface AppraisalInput {
  officeName: string;
  departmentDivision?: string;
  sectionUnit?: string;
  telephoneNo?: string;
  emailAddress?: string;
  officeAddress: string;
  personInCharge?: string;
  datePrepared: string;
  preparedBy?: string;
  preparedByPosition?: string;
  assistedBy?: string;
  approvedBy?: string;
  status: ScheduleStatus;
  records: InventoryRecordDraft[];
}

export interface AppraisalListFilters {
  search?: string;
  status?: RecordsDocStatus | "All";
}

/** The office block this form is filed under, used to prefill a new inventory. */
export const DEFAULT_OFFICE = {
  name: "General Services Office",
  departmentDivision: "Municipality of Alaminos",
  address: "Poblacion, Alaminos, Laguna, 4001",
} as const;

/** The caption printed under each signature line on the paper. */
export const SIGNATORY_CAPTIONS = {
  preparedBy: "Name and Position",
  assistedBy: "NAP Records Management Analyst",
  approvedBy: "Chief of the Division/Department",
} as const;
