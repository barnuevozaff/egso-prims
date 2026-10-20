/**
 * Violation Management domain types.
 *
 * The primary record is the VIOLATOR PROFILE. A violation belongs to exactly
 * one profile through `violatorId` — never through the person's name — so a
 * violator with four tickets is still one profile.
 */

/** Payment state of a single violation. */
export type PaymentStatus = "Pending" | "Paid" | "Cancelled";

export const PAYMENT_STATUSES: PaymentStatus[] = ["Pending", "Paid", "Cancelled"];

/**
 * Derived state of a whole profile. "No Record" is reserved for a profile that
 * carries no violations at all.
 */
export type ProfileStatus = "Paid" | "Pending" | "No Record";

export const PROFILE_STATUSES: ProfileStatus[] = ["Paid", "Pending", "No Record"];

/** Offences the office issues tickets for. */
export const VIOLATION_TYPES: string[] = [
  "Illegal Parking",
  "No Permit",
  "Overloading",
  "Obstruction",
  "Unauthorized Vending",
  "Improper Waste Disposal",
  "Noise Violation",
  "Unregistered Vehicle",
  "Illegal Structure",
  "Other",
];

/** How a settled violation was paid. */
export const PAYMENT_METHODS: string[] = ["Cash", "Check", "Bank Transfer", "Online Payment"];

/** A person on record with the General Services Office. */
export interface Violator {
  /** Archived (approved 2026-10-21): kept with everything it holds, marked no longer in use. */
  archived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  id: string;
  fullName: string;
  contactNumber?: string;
  email?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

/** One recorded violation, owned by a violator profile. */
export interface Violation {
  /** When and by whom the ticket was cancelled (Firebase; approved 2026-10-21). */
  cancelledAt?: string;
  cancelledBy?: string;
  id: string;
  violatorId: string;
  violationNo: string;
  violationType: string;
  description?: string;
  /** ISO date the ticket was issued. */
  dateIssued: string;
  /** Assessed amount in pesos. */
  amount: number;
  remarks?: string;

  /** The officer who apprehended the violator. */
  apprehendedBy?: string;
  /**
   * Serial pre-printed on the paper ticket handed over at apprehension.
   * Distinct from `orNumber`, which the treasury issues on payment.
   */
  citationNo?: string;

  paymentStatus: PaymentStatus;
  /** ISO date; empty until the violation is settled. */
  paymentDate?: string;
  orNumber?: string;
  amountPaid: number;
  paymentMethod?: string;
  paymentRemarks?: string;
  cancelReason?: string;
  /** amount − amountPaid, computed by the database. */
  outstandingBalance: number;

  createdAt: string;
  updatedAt: string;
}

/**
 * A profile with its violations folded in — the shape the main table and the
 * profile drawer both render. Built by `buildProfiles` in lib.ts; never stored.
 */
export interface ViolatorProfile {
  violator: Violator;
  violations: Violation[];
  totalViolations: number;
  paidCount: number;
  pendingCount: number;
  cancelledCount: number;
  /** Assessed total, excluding cancelled violations. */
  totalAmount: number;
  totalPaid: number;
  outstandingBalance: number;
  status: ProfileStatus;
}

/** Filters accepted by the profile list; maps to the violation set it folds. */
export interface ViolationListFilters {
  /** Matches a violator's name, any of their violation numbers, or any OR number. */
  search?: string;
  status?: ProfileStatus;
  violationType?: string;
  dateFrom?: Date;
  dateTo?: Date;
}
