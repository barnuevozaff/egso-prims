import type { FinalizedRecord } from "@/features/shared/revisions";

/** Water Consumption domain types. Shapes mirror the Supabase schema. */

export interface WaterAccount {
  /** Archived (approved 2026-10-21): kept with everything it holds, marked no longer in use. */
  archived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  id: string;
  accountNumber: string;
  /** Optional friendly name, e.g. "Municipal Hall — Main Building". */
  accountName?: string;
  location: string;
  meterNumber: string;
  createdAt: string;
  updatedAt: string;
}

export interface WaterBill extends FinalizedRecord {
  id: string;
  /** Centrally generated document number, e.g. WC-2026-000001. */
  docNumber?: string;
  accountId: string;
  /** 1–12 */
  billingMonth: number;
  billingYear: number;
  /** PHP */
  amount: number;
  /** Cubic metres consumed in the billing period. */
  consumption: number;
  remarks?: string;
  createdAt: string;
}

export type SubmeterStatus = "Active" | "Archived";

/** A submeter hanging off one main water account. */
export interface WaterSubmeter {
  id: string;
  accountId: string;
  submeterName: string;
  submeterNumber: string;
  /** DEPARTMENTS code of the office the submeter is assigned to. */
  assignedOffice: string;
  /** Sub-unit within the office, e.g. "Building Maintenance". */
  assignedDepartment?: string;
  /** Physical facility or area served, e.g. "Main Building". */
  assignedFacility?: string;
  /** Person accountable for this submeter. */
  assignedUser?: string;
  remarks?: string;
  status: SubmeterStatus;
  createdAt: string;
  updatedAt: string;
}

/** One monthly billing record for a submeter. */
export interface WaterSubmeterBill extends FinalizedRecord {
  id: string;
  submeterId: string;
  /** 1–12 */
  billingMonth: number;
  billingYear: number;
  /** Cubic metres drawn through the submeter. */
  consumption: number;
  /** PHP */
  amount: number;
  remarks?: string;
  createdAt: string;
}

/** One monthly meter reading for a submeter. */
export interface WaterMeterReading extends FinalizedRecord {
  id: string;
  submeterId: string;
  /** ISO date the meter was read. */
  readingDate: string;
  previousReading: number;
  currentReading: number;
  /** Always currentReading − previousReading; computed by the database. */
  consumption: number;
  /** PHP billed for this reading period. */
  amount: number;
  remarks?: string;
  createdAt: string;
}

export const SUBMETER_STATUSES: SubmeterStatus[] = ["Active", "Archived"];

// Calendar + movement primitives are shared with the other utility modules.
import type { ComparisonStatus } from "@/features/shared/periods";

export { MONTHS, monthName, monthShort, periodLabel } from "@/features/shared/periods";
export type { ComparisonStatus };

/** One account's month-over-month movement. */
export interface AccountComparison {
  account: WaterAccount;
  /** Amount for the selected period; null when no bill was recorded. */
  current: number | null;
  /** Amount for the preceding month; null when unavailable. */
  previous: number | null;
  /** current − previous (0 when either side is missing). */
  difference: number;
  /** Percentage change against the previous month; null when not computable. */
  percent: number | null;
  status: ComparisonStatus;
}

/** Combined movement across every registered account. */
export interface OverallComparison {
  currentTotal: number;
  previousTotal: number;
  difference: number;
  percent: number | null;
  status: ComparisonStatus;
  increased: number;
  decreased: number;
  unchanged: number;
  accounts: number;
}

/** One submeter's month-over-month movement. */
export interface SubmeterComparison {
  submeter: WaterSubmeter;
  /** Amount for the selected period; null when no bill was recorded. */
  current: number | null;
  /** Amount for the preceding month; null when unavailable. */
  previous: number | null;
  /** Cubic metres drawn in the selected period. */
  currentConsumption: number;
  /** current − previous (0 when either side is missing). */
  difference: number;
  /** Percentage change against the previous month; null when not computable. */
  percent: number | null;
  status: ComparisonStatus;
}

/** An account's totals rolled up from its submeters. */
export interface AccountRollup {
  totalAmount: number;
  totalConsumption: number;
  activeSubmeters: number;
  totalSubmeters: number;
}

/** Filters accepted by the bill list endpoint. */
export interface WaterBillFilters {
  /** Voided records are left out of lists and totals unless asked for (history views). */
  includeVoided?: boolean;
  accountId?: string;
  year?: number;
  month?: number;
  /** Inclusive period bounds, used by the period-range filter. */
  fromYear?: number;
  fromMonth?: number;
  toYear?: number;
  toMonth?: number;
}
