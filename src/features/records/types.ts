/**
 * Records Management domain types.
 *
 * The primary record is the DISPOSITION SCHEDULE — the National Archives of
 * the Philippines form an agency files under RA 9470 s. 2007. One schedule
 * carries the agency block and many record series, so a schedule and its
 * lines are always read and written together.
 */

/**
 * Where a schedule stands with the National Archives.
 *
 * Only a Draft may be edited freely. Once submitted the schedule is a record
 * of what was filed, so the list makes the distinction visible rather than
 * letting a clerk change a filed document without noticing.
 */
export type ScheduleStatus = "Draft" | "Submitted" | "Approved" | "Returned";

/**
 * A saved form's status: the form's own four, or Cancelled once voided. A
 * voided form keeps its number, lines and filing history and cannot be
 * changed; it is never deleted.
 */
export type RecordsDocStatus = ScheduleStatus | "Cancelled";

export const SCHEDULE_STATUSES: ScheduleStatus[] = [
  "Draft",
  "Submitted",
  "Approved",
  "Returned",
];

/** One line of the form — fields 5 through 8. */
export interface RecordSeries {
  id: string;
  scheduleId: string;
  /** Field 5. The printed row label, cited in correspondence. */
  itemNumber: number;
  /** Field 6. */
  titleAndDescription: string;
  /** Field 7, in years, in the office of origin. */
  retentionActive: number;
  /** Field 7, in years, in the records centre afterwards. */
  retentionStorage: number;
  /** Field 7 Total. Computed by the database; never sent on write. */
  retentionTotal: number;
  /** Field 8. */
  remarks?: string;
}

/**
 * A line as the form collects it.
 *
 * `id` is carried through an edit rather than dropped. A save rewrites a
 * schedule's lines, and re-inserting them under fresh identities meant a
 * one-character fix to a title read, to everything downstream, as every
 * series in the schedule being destroyed and a new set created: the audit
 * trail said so, and anything attached to a series — where it sits on the
 * shelf — went with it. A line the clerk added in this session has no id
 * yet, and the database assigns one.
 */
export type RecordSeriesDraft = Omit<RecordSeries, "id" | "scheduleId" | "retentionTotal"> & {
  id?: string;
};

/** The form's header — fields 1 through 4 — without its lines. */
export interface DispositionSchedule {
  id: string;
  /** Field 3, allocated by the shared document numbering service. */
  scheduleNo: string;
  /** Field 1. */
  agencyName: string;
  /** Field 2. */
  agencyAddress: string;
  /** Field 4, as yyyy-MM-dd. */
  datePrepared: string;
  status: RecordsDocStatus;
  /** Set when the form was voided (approved policy, 2026-10-20). */
  voidReason?: string;
  voidedAt?: string;
  /** The Administrator who voided it (email). */
  voidedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** A schedule with its lines — what the detail page and the print form read. */
export interface DispositionScheduleWithSeries extends DispositionSchedule {
  series: RecordSeries[];
}

/** What the create and edit forms submit. */
export interface ScheduleInput {
  agencyName: string;
  agencyAddress: string;
  datePrepared: string;
  status: ScheduleStatus;
  series: RecordSeriesDraft[];
}

export interface ScheduleListFilters {
  /** Matches schedule number, agency name or any series title. */
  search?: string;
  status?: RecordsDocStatus | "All";
}

/** The agency block this office files under, used to prefill a new schedule. */
export const DEFAULT_AGENCY = {
  name: "Municipality of Alaminos — General Services Office",
  address: "Poblacion, Alaminos, Laguna, 4001",
} as const;
